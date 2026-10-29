#![allow(clippy::unwrap_used)]

use aidp_lib::gateway::{
    openai_compat::OpenAiCompat, ChatEvent, ChatMessage, ChatRequest, ModelProvider, ProviderError,
    Role, Usage,
};
use secrecy::SecretString;
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn capture() -> (Channel<ChatEvent>, Arc<Mutex<Vec<ChatEvent>>>) {
    let events = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&events);
    let channel = Channel::new(move |body| {
        let event: ChatEvent = match body {
            InvokeResponseBody::Json(s) => serde_json::from_str(&s).unwrap(),
            InvokeResponseBody::Raw(b) => serde_json::from_slice(&b).unwrap(),
        };
        events_clone.lock().unwrap().push(event);
        Ok(())
    });
    (channel, events)
}

fn deltas(events: &Mutex<Vec<ChatEvent>>) -> Vec<String> {
    events
        .lock()
        .unwrap()
        .iter()
        .filter_map(|e| match e {
            ChatEvent::Delta(text) => Some(text.clone()),
            _ => None,
        })
        .collect()
}

fn req() -> ChatRequest {
    ChatRequest {
        model: "test-model".to_string(),
        messages: vec![ChatMessage {
            role: Role::User,
            content: "hi".to_string(),
        }],
    }
}

fn sse(payloads: &[&str]) -> String {
    payloads
        .iter()
        .map(|p| format!("data: {p}\n\n"))
        .collect::<Vec<_>>()
        .join("")
}

fn provider(server: &MockServer) -> OpenAiCompat {
    OpenAiCompat::new(
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

