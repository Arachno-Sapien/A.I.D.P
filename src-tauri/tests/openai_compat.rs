#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::gateway::{
    openai_compat::OpenAiCompat, ModelProvider, ProviderError, ToolCall, ToolOutput, ToolRound,
    ToolSpec, Usage,
};
use common::{capture, deltas, req, sse};
use secrecy::SecretString;
use serde_json::json;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn provider(server: &MockServer) -> OpenAiCompat {
    OpenAiCompat::new(
        reqwest::Client::new(),
        format!("{}/v1", server.uri()),
        SecretString::from("sk-test".to_string()),
    )
}

#[tokio::test]
async fn streams_deltas_and_returns_usage() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"content":"Hel"}}]}"#,
        r#"{"choices":[{"delta":{"content":"lo"}}]}"#,
        r#"{"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}"#,
        "[DONE]",
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("authorization", "Bearer sk-test"))
        .and(body_partial_json(json!({
            "model": "test-model",
            "stream": true
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, events) = capture();
    let cancel = CancellationToken::new();

    let reply = p.stream_chat(req(), channel, cancel).await.unwrap();

    assert_eq!(deltas(&events), vec!["Hel", "lo"]);
    assert_eq!(
        reply.usage,
        Usage {
            tokens_in: Some(5),
            tokens_out: Some(2)
        }
    );
}

#[tokio::test]
async fn invalid_key_on_401() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, events) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(err, ProviderError::InvalidKey);
    assert!(events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn rate_limited_with_retry_after() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "7"))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(
        err,
        ProviderError::RateLimited {
            retry_after_secs: Some(7)
        }
    );
}

#[tokio::test]
async fn model_not_found_on_404() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(err, ProviderError::ModelNotFound);
}

#[tokio::test]
async fn context_too_long_on_400() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({
            "error": {
                "code": "context_length_exceeded",
                "message": "too long"
            }
        })))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(err, ProviderError::ContextTooLong);
}

#[tokio::test]
async fn dropped_stream_keeps_deltas_and_errors() {
    let server = MockServer::start().await;
    let body = sse(&[r#"{"choices":[{"delta":{"content":"Hel"}}]}"#]);

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, events) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(deltas(&events), vec!["Hel"]);
    assert_eq!(
        err,
        ProviderError::Provider {
            message: "the connection closed before the reply finished".to_string()
        }
    );
}

#[tokio::test]
async fn offline_when_nothing_listens() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let p = OpenAiCompat::new(
        reqwest::Client::new(),
        format!("http://127.0.0.1:{port}/v1"),
        SecretString::from("sk-test".to_string()),
    );
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(err, ProviderError::Offline);
}

#[tokio::test]
async fn stop_cancels_a_waiting_request() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(5)))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let cancel_clone = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        cancel_clone.cancel();
    });

    let start = Instant::now();
    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    let elapsed = start.elapsed();

    assert_eq!(err, ProviderError::Cancelled);
    assert!(
        elapsed < Duration::from_secs(2),
        "expected under 2s, took {elapsed:?}"
    );
}


#[tokio::test]
async fn provider_error_inside_stream_is_reported() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"content":"Hel"}}]}"#,
        r#"{"error":{"code":"server_error","message":"Provider disconnected"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}"#,
        "[DONE]",
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let (channel, events) = capture();
    let result = provider(&server)
        .stream_chat(req(), channel, CancellationToken::new())
        .await;

    assert_eq!(deltas(&events), vec!["Hel"]);
    assert_eq!(
        result,
        Err(ProviderError::Provider {
            message: "Provider disconnected".to_string()
        })
    );
}

#[tokio::test]
async fn list_models_parses_ids_names_and_context() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("authorization", "Bearer sk-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [
                {"id": "b/model-b", "name": "Model B", "context_length": 128000},
                {"id": "a-model"}
            ]
        })))
        .mount(&server)
        .await;

    let p = provider(&server);
    let models = p.list_models().await.unwrap();
    assert_eq!(
        models,
        vec![
            aidp_lib::gateway::ModelInfo {
                id: "a-model".to_string(),
                display_name: "a-model".to_string(),
                context_window: None,
                supports_tools: None,
            },
            aidp_lib::gateway::ModelInfo {
                id: "b/model-b".to_string(),
                display_name: "Model B".to_string(),
                context_window: Some(128000),
                supports_tools: None,
            },
        ]
    );
}

#[tokio::test]
async fn list_models_reads_supported_parameters() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": [
                {
                    "id": "model-tools",
                    "name": "Model with Tools",
                    "supported_parameters": ["tools", "temperature"]
                },
                {
                    "id": "model-no-tools",
                    "name": "Model without Tools",
                    "supported_parameters": ["temperature"]
                },
                {
                    "id": "model-unknown",
                    "name": "Model Unknown"
                }
            ]
        })))
        .mount(&server)
        .await;

    let p = provider(&server);
    let models = p.list_models().await.unwrap();
    assert_eq!(models.len(), 3);
    let m1 = models.iter().find(|m| m.id == "model-tools").unwrap();
    let m2 = models.iter().find(|m| m.id == "model-no-tools").unwrap();
    let m3 = models.iter().find(|m| m.id == "model-unknown").unwrap();
    assert_eq!(m1.supports_tools, Some(true));
    assert_eq!(m2.supports_tools, Some(false));
    assert_eq!(m3.supports_tools, None);
}

#[tokio::test]
async fn list_models_401_is_invalid_key() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let p = provider(&server);
    let err = p.list_models().await.unwrap_err();
    assert_eq!(err, ProviderError::InvalidKey);
}

#[tokio::test]
async fn list_models_404_points_at_base_url() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;

    let p = provider(&server);
    let err = p.list_models().await.unwrap_err();
    match err {
        ProviderError::Provider { message } => {
            assert!(message.contains("base URL"), "message was: {message}");
        }
        _ => panic!("unexpected error: {err:?}"),
    }
}

#[tokio::test]
async fn list_models_empty_is_ok() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let p = provider(&server);
    let models = p.list_models().await.unwrap();
    assert!(models.is_empty());
}

#[tokio::test]
async fn test_connection_follows_list_models() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .up_to_n_times(1)
        .mount(&server)
        .await;

    let p = provider(&server);
    assert!(p.test_connection().await.is_ok());

    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    assert_eq!(
        p.test_connection().await.unwrap_err(),
        ProviderError::InvalidKey
    );
}

#[tokio::test]
async fn sends_tools_only_when_given() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(sse(&[
            r#"{"choices":[{"delta":{"content":"ok"}}]}"#,
            "[DONE]",
        ])))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    // 1. Without tools: body has no "tools" key
    let mut request_no_tools = req();
    request_no_tools.tools = vec![];
    p.stream_chat(request_no_tools, channel, CancellationToken::new())
        .await
        .unwrap();

    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let body_no_tools: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(body_no_tools.get("tools").is_none());

    // 2. With two specs:
    let (channel2, _) = capture();
    let mut request_with_tools = req();
    request_with_tools.tools = vec![
        ToolSpec {
            name: "list_files",
            description: "List files",
            schema: json!({"type": "object", "properties": {"path": {"type": "string"}}}),
        },
        ToolSpec {
            name: "read_file",
            description: "Read a file",
            schema: json!({"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}),
        },
    ];
    p.stream_chat(request_with_tools, channel2, CancellationToken::new())
        .await
        .unwrap();

    let requests2 = server.received_requests().await.unwrap();
    assert_eq!(requests2.len(), 2);
    let body_with_tools: serde_json::Value = serde_json::from_slice(&requests2[1].body).unwrap();
    let tools = body_with_tools.get("tools").unwrap().as_array().unwrap();
    assert_eq!(tools.len(), 2);
    assert_eq!(tools[1]["function"]["name"], "read_file");
    assert_eq!(
        tools[1]["function"]["parameters"],
        json!({"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]})
    );
}

#[tokio::test]
async fn parses_streamed_tool_calls() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"content":"Let me check."}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\"pa"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"list_files","arguments":"{\"path\":\"dir\"}"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\":\"a.ts\"}"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
        "[DONE]",
    ]);
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, events) = capture();
    let reply = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(deltas(&events), vec!["Let me check."]);
    assert_eq!(
        reply.tool_calls,
        vec![
            ToolCall {
                id: "call_1".to_string(),
                name: "read_file".to_string(),
                input: json!({"path": "a.ts"}),
            },
            ToolCall {
                id: "call_2".to_string(),
                name: "list_files".to_string(),
                input: json!({"path": "dir"}),
            },
        ]
    );
    assert_eq!(
        reply.assistant,
        json!({
            "role": "assistant",
            "content": "Let me check.",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "arguments": "{\"path\":\"a.ts\"}"
                    }
                },
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {
                        "name": "list_files",
                        "arguments": "{\"path\":\"dir\"}"
                    }
                }
            ]
        })
    );
}

#[tokio::test]
async fn tool_calls_with_stop_and_no_ids() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"function":{"name":"list_files","arguments":"{}"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
        "[DONE]",
    ]);
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let reply = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(
        reply.tool_calls,
        vec![ToolCall {
            id: "call_0".to_string(),
            name: "list_files".to_string(),
            input: json!({}),
        }]
    );
}

#[tokio::test]
async fn keeps_extra_tool_call_fields() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"fn1","arguments":"{}"},"extra_content":{"google":{"thought_signature":"sig"}}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
        "[DONE]",
    ]);
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let reply = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(
        reply.assistant["tool_calls"][0]["extra_content"],
        json!({"google": {"thought_signature": "sig"}})
    );
}

#[tokio::test]
async fn invalid_arguments_stay_a_string() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"fn1","arguments":"{bad"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
        "[DONE]",
    ]);
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let reply = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(
        reply.tool_calls[0].input,
        serde_json::Value::String("{bad".to_string())
    );
}

#[tokio::test]
async fn cut_off_tool_call_is_an_error() {
    let server = MockServer::start().await;
    let body = sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"fn1","arguments":"{\"a\":1"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"length"}]}"#,
        "[DONE]",
    ]);
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();
    let err = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap_err();

    assert_eq!(
        err,
        ProviderError::Provider {
            message: "The reply was cut off before its tool call was complete.".to_string(),
        }
    );
}

#[tokio::test]
async fn renders_tool_rounds() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string(sse(&[
            r#"{"choices":[{"delta":{"content":"done"}}]}"#,
            "[DONE]",
        ])))
        .mount(&server)
        .await;

    let p = provider(&server);
    let (channel, _) = capture();

    let mut request = req();
    request.rounds = vec![ToolRound {
        assistant: json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "read_file", "arguments": "{\"path\":\"a.ts\"}"}
                },
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {"name": "read_file", "arguments": "{\"path\":\"missing.ts\"}"}
                }
            ]
        }),
        results: vec![
            ToolOutput {
                call_id: "call_1".to_string(),
                content: "file contents".to_string(),
                is_error: false,
            },
            ToolOutput {
                call_id: "call_2".to_string(),
                content: "file not found".to_string(),
                is_error: true,
            },
        ],
    }];

    p.stream_chat(request, channel, CancellationToken::new())
        .await
        .unwrap();

    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    let msgs = body.get("messages").unwrap().as_array().unwrap();

    let len = msgs.len();
    assert!(len >= 3);
    assert_eq!(msgs[len - 3]["role"], "assistant");
    assert_eq!(msgs[len - 2]["role"], "tool");
    assert_eq!(msgs[len - 2]["tool_call_id"], "call_1");
    assert_eq!(msgs[len - 2]["content"], "file contents");
    assert_eq!(msgs[len - 1]["role"], "tool");
    assert_eq!(msgs[len - 1]["tool_call_id"], "call_2");
    assert_eq!(msgs[len - 1]["content"], "Error: file not found");
}
