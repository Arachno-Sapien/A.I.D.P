#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::gateway::{
    openai_compat::OpenAiCompat, ModelProvider, ProviderError, Usage,
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

    let usage = p.stream_chat(req(), channel, cancel).await.unwrap();

    assert_eq!(deltas(&events), vec!["Hel", "lo"]);
    assert_eq!(
        usage,
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
