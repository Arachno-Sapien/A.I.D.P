#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::gateway::ollama_chat::OllamaChat;
use aidp_lib::gateway::{
    ChatMessage, ChatRequest, LocalOptions, ModelProvider, ProviderError, Role, ToolCall,
    ToolOutput, ToolRound, ToolSpec, TOOLS_UNSUPPORTED,
};
use common::{capture, deltas};
use serde_json::json;
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_json, body_partial_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn ndjson(lines: &[&str]) -> String {
    lines.join("\n") + "\n"
}

fn base_req() -> ChatRequest {
    ChatRequest {
        model: "qwen2.5-coder:1.5b".to_string(),
        messages: vec![ChatMessage {
            role: Role::User,
            content: "hello".to_string(),
        }],
        tools: vec![],
        rounds: vec![],
        local: Default::default(),
    }
}

#[tokio::test]
async fn streams_text_and_usage() {
    let server = MockServer::start().await;
    let body = ndjson(&[
        r#"{"message":{"role":"assistant","content":"Hel"},"done":false}"#,
        r#"{"message":{"role":"assistant","content":"lo "},"done":false}"#,
        r#"{"message":{"role":"assistant","content":"world!"},"done":false}"#,
        r#"{"done":true,"prompt_eval_count":12,"eval_count":34}"#,
    ]);

    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (channel, events) = capture();
    let reply = adapter
        .stream_chat(base_req(), channel, CancellationToken::new())
        .await
        .expect("stream_chat");

    assert_eq!(deltas(&events), vec!["Hel", "lo ", "world!"]);
    assert_eq!(reply.usage.tokens_in, Some(12));
    assert_eq!(reply.usage.tokens_out, Some(34));
    assert_eq!(
        reply.assistant,
        json!({
            "role": "assistant",
            "content": "Hello world!"
        })
    );
}

#[tokio::test]
async fn sends_options_only_when_set() {
    let server = MockServer::start().await;

    // 1. With num_ctx and keep_alive set
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_partial_json(json!({
            "model": "qwen2.5-coder:1.5b",
            "options": { "num_ctx": 8192 },
            "keep_alive": 1800
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(ndjson(&[r#"{"done":true,"prompt_eval_count":5,"eval_count":5}"#])),
        )
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let mut req_with_options = base_req();
    req_with_options.local = LocalOptions {
        num_ctx: Some(8192),
        keep_alive: Some(1800),
    };

    let (ch1, _) = capture();
    adapter
        .stream_chat(req_with_options, ch1, CancellationToken::new())
        .await
        .expect("stream with options");

    server.reset().await;

    // 2. Default options -> verify neither "options" nor "keep_alive" is in the body
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_json(json!({
            "model": "qwen2.5-coder:1.5b",
            "messages": [{ "role": "user", "content": "hello" }],
            "stream": true
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(ndjson(&[r#"{"done":true,"prompt_eval_count":5,"eval_count":5}"#])),
        )
        .mount(&server)
        .await;

    let (ch2, _) = capture();
    adapter
        .stream_chat(base_req(), ch2, CancellationToken::new())
        .await
        .expect("stream without options");
}

#[tokio::test]
async fn sends_tools_only_when_given() {
    let server = MockServer::start().await;

    // 1. Without tools -> no "tools" key
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_json(json!({
            "model": "qwen2.5-coder:1.5b",
            "messages": [{ "role": "user", "content": "hello" }],
            "stream": true
        })))
        .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[r#"{"done":true}"#])))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch1, _) = capture();
    adapter
        .stream_chat(base_req(), ch1, CancellationToken::new())
        .await
        .expect("stream without tools");

    server.reset().await;

    // 2. With two specs -> tools[1].function.name present
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_partial_json(json!({
            "tools": [
                {
                    "type": "function",
                    "function": { "name": "t1", "description": "d1", "parameters": {} }
                },
                {
                    "type": "function",
                    "function": { "name": "t2", "description": "d2", "parameters": {} }
                }
            ]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[r#"{"done":true}"#])))
        .mount(&server)
        .await;

    let mut req_tools = base_req();
    req_tools.tools = vec![
        ToolSpec {
            name: "t1",
            description: "d1",
            schema: json!({}),
        },
        ToolSpec {
            name: "t2",
            description: "d2",
            schema: json!({}),
        },
    ];

    let (ch2, _) = capture();
    adapter
        .stream_chat(req_tools, ch2, CancellationToken::new())
        .await
        .expect("stream with tools");
}

#[tokio::test]
async fn parses_tool_calls() {
    let server = MockServer::start().await;
    let body = ndjson(&[
        r#"{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"a"}}},{"function":{"name":"search","arguments":{"query":"b"}}}]},"done":false}"#,
        r#"{"done":true}"#,
    ]);

    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, _) = capture();
    let reply = adapter
        .stream_chat(base_req(), ch, CancellationToken::new())
        .await
        .expect("tool calls");

    assert_eq!(reply.tool_calls.len(), 2);
    assert_eq!(
        reply.tool_calls[0],
        ToolCall {
            id: "call_0".to_string(),
            name: "read_file".to_string(),
            input: json!({ "path": "a" }),
        }
    );
    assert_eq!(
        reply.tool_calls[1],
        ToolCall {
            id: "call_1".to_string(),
            name: "search".to_string(),
            input: json!({ "query": "b" }),
        }
    );

    let assistant_tc = reply
        .assistant
        .get("tool_calls")
        .and_then(|v| v.as_array())
        .expect("assistant.tool_calls array");
    assert_eq!(assistant_tc.len(), 2);
}

#[tokio::test]
async fn string_arguments_are_parsed() {
    let server = MockServer::start().await;
    let body = ndjson(&[
        r#"{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"f1","arguments":"{\"path\":\"a\"}"}},{"function":{"name":"f2","arguments":"{bad"}}]},"done":false}"#,
        r#"{"done":true}"#,
    ]);

    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, _) = capture();
    let reply = adapter
        .stream_chat(base_req(), ch, CancellationToken::new())
        .await
        .expect("string arguments");

    assert_eq!(reply.tool_calls.len(), 2);
    assert_eq!(reply.tool_calls[0].input, json!({ "path": "a" }));
    assert_eq!(
        reply.tool_calls[1].input,
        serde_json::Value::String("{bad".to_string())
    );

    // Ollama parses replayed arguments into a map and rejects a string, so the
    // replay always carries an object.
    let calls = &reply.assistant["tool_calls"];
    assert_eq!(calls[0]["function"]["arguments"], json!({ "path": "a" }));
    assert_eq!(calls[1]["function"]["arguments"], json!({}));
}

#[tokio::test]
async fn server_error_mentioning_not_found_is_not_model_not_found() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(
            ResponseTemplate::new(500).set_body_string(r#"{"error":"open blob: file not found"}"#),
        )
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, _) = capture();
    let err = adapter
        .stream_chat(base_req(), ch, CancellationToken::new())
        .await
        .unwrap_err();
    assert!(matches!(err, ProviderError::Provider { .. }), "{err:?}");
}

#[tokio::test]
async fn keeps_thinking_for_replay() {
    let server = MockServer::start().await;
    let body = ndjson(&[
        r#"{"message":{"role":"assistant","content":"","thinking":"Hmm, let me consider."},"done":false}"#,
        r#"{"message":{"role":"assistant","content":"Done!","thinking":" More thoughts."},"done":false}"#,
        r#"{"done":true}"#,
    ]);

    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, events) = capture();
    let reply = adapter
        .stream_chat(base_req(), ch, CancellationToken::new())
        .await
        .expect("thinking");

    // Only content deltas, no thinking delta
    assert_eq!(deltas(&events), vec!["Done!"]);
    assert_eq!(
        reply.assistant.get("thinking").and_then(|v| v.as_str()),
        Some("Hmm, let me consider. More thoughts.")
    );
    assert_eq!(
        reply.assistant.get("content").and_then(|v| v.as_str()),
        Some("Done!")
    );
}

#[tokio::test]
async fn renders_tool_rounds() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_partial_json(json!({
            "messages": [
                { "role": "user", "content": "hello" },
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        { "function": { "name": "read_file", "arguments": { "path": "a" } } },
                        { "function": { "name": "search", "arguments": { "query": "b" } } }
                    ]
                },
                { "role": "tool", "tool_name": "read_file", "content": "file contents" },
                { "role": "tool", "tool_name": "search", "content": "Error: permission denied" }
            ]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[r#"{"done":true}"#])))
        .mount(&server)
        .await;

    let mut req = base_req();
    req.rounds = vec![ToolRound {
        assistant: json!({
            "role": "assistant",
            "content": "",
            "tool_calls": [
                { "function": { "name": "read_file", "arguments": { "path": "a" } } },
                { "function": { "name": "search", "arguments": { "query": "b" } } }
            ]
        }),
        results: vec![
            ToolOutput {
                call_id: "call_0".to_string(),
                content: "file contents".to_string(),
                is_error: false,
            },
            ToolOutput {
                call_id: "call_1".to_string(),
                content: "permission denied".to_string(),
                is_error: true,
            },
        ],
    }];

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, _) = capture();
    adapter
        .stream_chat(req, ch, CancellationToken::new())
        .await
        .expect("tool rounds rendered");
}

#[tokio::test]
async fn error_line_and_http_errors() {
    let server = MockServer::start().await;

    // 1. In-stream error line
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(
            ResponseTemplate::new(200).set_body_string(ndjson(&[r#"{"error":"stream broke"}"#])),
        )
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch1, _) = capture();
    let err1 = adapter
        .stream_chat(base_req(), ch1, CancellationToken::new())
        .await
        .expect_err("error line");
    assert_eq!(
        err1,
        ProviderError::Provider {
            message: "stream broke".to_string()
        }
    );

    server.reset().await;

    // 2. HTTP 404 -> ModelNotFound
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(
            ResponseTemplate::new(404).set_body_string(r#"{"error":"model 'x' not found"}"#),
        )
        .mount(&server)
        .await;

    let (ch2, _) = capture();
    let err2 = adapter
        .stream_chat(base_req(), ch2, CancellationToken::new())
        .await
        .expect_err("404");
    assert_eq!(err2, ProviderError::ModelNotFound);

    server.reset().await;

    // 3. HTTP 400 does not support tools -> TOOLS_UNSUPPORTED
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_body_string(r#"{"error":"model does not support tools"}"#),
        )
        .mount(&server)
        .await;

    let (ch3, _) = capture();
    let err3 = adapter
        .stream_chat(base_req(), ch3, CancellationToken::new())
        .await
        .expect_err("tools unsupported");
    assert_eq!(
        err3,
        ProviderError::Provider {
            message: TOOLS_UNSUPPORTED.to_string()
        }
    );

    server.reset().await;

    // 4. HTTP 500 -> Provider
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(500).set_body_string("internal server error"))
        .mount(&server)
        .await;

    let (ch4, _) = capture();
    let err4 = adapter
        .stream_chat(base_req(), ch4, CancellationToken::new())
        .await
        .expect_err("500");
    match err4 {
        ProviderError::Provider { .. } => {}
        other => panic!("expected Provider error, got {:?}", other),
    }
}

#[tokio::test]
async fn offline_and_dropped_stream() {
    // 1. Unreachable base -> Offline
    let dead = OllamaChat::new(reqwest::Client::new(), "http://127.0.0.1:1".to_string());
    let (ch1, _) = capture();
    let err_offline = dead
        .stream_chat(base_req(), ch1, CancellationToken::new())
        .await
        .expect_err("offline");
    assert_eq!(err_offline, ProviderError::Offline);

    // 2. Stream drops without done: true -> deltas kept, Provider error
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[
            r#"{"message":{"role":"assistant","content":"partial "},"done":false}"#,
        ])))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch2, events) = capture();
    let err_drop = adapter
        .stream_chat(base_req(), ch2, CancellationToken::new())
        .await
        .expect_err("dropped stream");

    assert_eq!(deltas(&events), vec!["partial "]);
    match err_drop {
        ProviderError::Provider { message } => {
            assert!(message.contains("connection closed before the reply finished"));
        }
        other => panic!("expected connection closed error, got {:?}", other),
    }
}

#[tokio::test]
async fn cut_off_tool_call() {
    let server = MockServer::start().await;
    let body = ndjson(&[
        r#"{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"f","arguments":{}}}]},"done":false}"#,
        r#"{"done":true,"done_reason":"length"}"#,
    ]);

    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .mount(&server)
        .await;

    let adapter = OllamaChat::new(reqwest::Client::new(), server.uri());
    let (ch, _) = capture();
    let err = adapter
        .stream_chat(base_req(), ch, CancellationToken::new())
        .await
        .expect_err("cut off tool call");

    match err {
        ProviderError::Provider { message } => {
            assert_eq!(
                message,
                "The reply was cut off before its tool call was complete."
            );
        }
        other => panic!("expected cut off error, got {:?}", other),
    }
}
