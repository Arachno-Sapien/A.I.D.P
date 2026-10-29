#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::gateway::{
    anthropic::Anthropic, provider, ChatEvent, ChatMessage, ChatRequest, ConnectionKind,
    ModelInfo, ModelProvider, ProviderError, Role, Usage,
};
use common::{capture, deltas, events, req};
use secrecy::SecretString;
use serde_json::json;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Match, Mock, MockServer, Request, ResponseTemplate};

fn test_provider(server: &MockServer) -> Anthropic {
    Anthropic::new(
        reqwest::Client::new(),
        format!("{}/v1", server.uri()),
        SecretString::from("sk-ant-test".to_string()),
    )
}

struct SystemKeyOmittedMatcher;

impl Match for SystemKeyOmittedMatcher {
    fn matches(&self, request: &Request) -> bool {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&request.body) {
            val.get("system").is_none()
        } else {
            false
        }
    }
}

#[tokio::test]
async fn streams_text_deltas_and_usage() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":25}}}"#,
        ),
        (
            "content_block_start",
            r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}"#,
        ),
        ("ping", r#"{"type":"ping"}"#),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}"#,
        ),
        ("content_block_stop", r#"{"type":"content_block_stop","index":0}"#),
        (
            "message_delta",
            r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "sk-ant-test"))
        .and(header("anthropic-version", "2026-10-21"))
        .and(body_partial_json(json!({
            "model": "test-model",
            "stream": true,
            "max_tokens": 8192,
            "system": "Be brief.",
            "messages": [{"role": "user", "content": "hi"}]
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let request = ChatRequest {
        model: "test-model".to_string(),
        messages: vec![
            ChatMessage {
                role: Role::System,
                content: "Be brief.".to_string(),
            },
            ChatMessage {
                role: Role::User,
                content: "hi".to_string(),
            },
        ],
    };

    let usage = p.stream_chat(request, channel, cancel).await.unwrap();

    assert_eq!(deltas(&events_log), vec!["Hel", "lo"]);
    assert_eq!(
        usage,
        Usage {
            tokens_in: Some(25),
            tokens_out: Some(12),
        }
    );
}

#[tokio::test]
async fn system_is_omitted_when_there_is_none() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":5}}}"#,
        ),
        (
            "message_delta",
            r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "sk-ant-test"))
        .and(header("anthropic-version", "2026-10-21"))
        .and(SystemKeyOmittedMatcher)
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let res = p.stream_chat(req(), channel, cancel).await;
    assert!(res.is_ok());
}

#[tokio::test]
async fn ignores_unknown_events_and_non_text_deltas() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":10}}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}"#,
        ),
        ("future_event", r#"{"something":"new"}"#),
        (
            "message_delta",
            r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let usage = p.stream_chat(req(), channel, cancel).await.unwrap();
    assert!(deltas(&events_log).is_empty());
    assert_eq!(
        usage,
        Usage {
            tokens_in: Some(10),
            tokens_out: Some(5),
        }
    );
}

#[tokio::test]
async fn refusal_is_an_error() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":10}}}"#,
        ),
        (
            "message_delta",
            r#"{"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":5}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, _) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(
        err,
        ProviderError::Provider {
            message: "The model declined to answer this request.".to_string()
        }
    );
}

#[tokio::test]
async fn malformed_event_is_an_error() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"#,
        ),
        ("content_block_delta", "{not json"),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, captured) = capture();
    let err = p
        .stream_chat(req(), channel, CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(deltas(&captured), vec!["x"]);
    assert_eq!(
        err,
        ProviderError::Provider {
            message: "the provider sent data the app could not read".to_string()
        }
    );
}

#[tokio::test]
async fn closed_channel_stops_the_stream() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let closed: Channel<ChatEvent> =
        Channel::new(|_| Err(std::io::Error::other("window closed").into()));
    let err = p
        .stream_chat(req(), closed, CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(err, ProviderError::Cancelled);
}

#[tokio::test]
async fn error_event_keeps_deltas_and_maps_the_type() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":10}}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"#,
        ),
        (
            "error",
            r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
        ),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(deltas(&events_log), vec!["x"]);
    assert_eq!(
        err,
        ProviderError::Provider {
            message: "Overloaded".to_string()
        }
    );
}

#[test]
fn map_error_type_table() {
    use aidp_lib::gateway::anthropic::map_error_type;

    assert_eq!(
        map_error_type("authentication_error", "bad key"),
        ProviderError::InvalidKey
    );
    assert_eq!(
        map_error_type("permission_error", "no access"),
        ProviderError::InvalidKey
    );
    assert_eq!(
        map_error_type("rate_limit_error", "slow down"),
        ProviderError::RateLimited {
            retry_after_secs: None
        }
    );
    assert_eq!(
        map_error_type("not_found_error", "missing"),
        ProviderError::ModelNotFound
    );
    assert_eq!(
        map_error_type("overloaded_error", "Overloaded"),
        ProviderError::Provider {
            message: "Overloaded".to_string()
        }
    );
    assert_eq!(
        map_error_type("invalid_request_error", "bad request"),
        ProviderError::Provider {
            message: "bad request".to_string()
        }
    );
}

#[tokio::test]
async fn dropped_stream_keeps_deltas_and_errors() {
    let server = MockServer::start().await;
    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":10}}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}"#,
        ),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
    assert_eq!(deltas(&events_log), vec!["Hel"]);
    assert_eq!(
        err,
        ProviderError::Provider {
            message: "the connection closed before the reply finished".to_string()
        }
    );
}

#[tokio::test]
async fn http_errors_are_mapped() {
    let cases = vec![
        (401, None, "".to_string(), ProviderError::InvalidKey),
        (
            429,
            Some("7"),
            "".to_string(),
            ProviderError::RateLimited {
                retry_after_secs: Some(7),
            },
        ),
        (404, None, "".to_string(), ProviderError::ModelNotFound),
        (
            400,
            None,
            r#"{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 250000 tokens > 200000 maximum"}}"#.to_string(),
            ProviderError::ContextTooLong,
        ),
        (
            529,
            None,
            r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#.to_string(),
            ProviderError::Provider {
                message: "HTTP 529: Overloaded".to_string(),
            },
        ),
    ];

    for (status, retry_after, body, expected_err) in cases {
        let server = MockServer::start().await;
        let mut resp = ResponseTemplate::new(status).set_body_string(body);
        if let Some(ra) = retry_after {
            resp = resp.insert_header("retry-after", ra);
        }

        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(resp)
            .mount(&server)
            .await;

        let p = test_provider(&server);
        let (channel, _) = capture();
        let cancel = CancellationToken::new();

        let err = p.stream_chat(req(), channel, cancel).await.unwrap_err();
        assert_eq!(err, expected_err);
    }
}

#[tokio::test]
async fn stop_cancels_a_waiting_request() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(5)))
        .mount(&server)
        .await;

    let p = test_provider(&server);
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
async fn list_models_parses_display_name_and_context() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("x-api-key", "sk-ant-test"))
        .and(header("anthropic-version", "2026-10-21"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [{
                "id": "claude-sonnet-5-5",
                "display_name": "Claude Sonnet 5.5",
                "max_input_tokens": 1000000,
                "type": "model"
            }],
            "has_more": false
        })))
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let models = p.list_models().await.unwrap();

    assert_eq!(
        models,
        vec![ModelInfo {
            id: "claude-sonnet-5-5".to_string(),
            display_name: "Claude Sonnet 5.5".to_string(),
            context_window: Some(1000000),
        }]
    );
}

#[tokio::test]
async fn list_models_401_is_invalid_key() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let p = test_provider(&server);
    let err = p.list_models().await.unwrap_err();
    assert_eq!(err, ProviderError::InvalidKey);
}

#[test]
fn factory_builds_the_right_adapter() {
    assert_eq!(
        ConnectionKind::from_db("openai_compat"),
        Some(ConnectionKind::OpenaiCompat)
    );
    assert_eq!(
        ConnectionKind::from_db("anthropic"),
        Some(ConnectionKind::Anthropic)
    );
    assert_eq!(ConnectionKind::from_db("ollama"), None);

    assert_eq!(ConnectionKind::OpenaiCompat.as_db(), "openai_compat");
    assert_eq!(ConnectionKind::Anthropic.as_db(), "anthropic");

    let client = reqwest::Client::new();
    let key = SecretString::from("sk-test".to_string());
    let _openai = provider(
        ConnectionKind::OpenaiCompat,
        client.clone(),
        "https://api.openai.com/v1".to_string(),
        key.clone(),
    );
    let _anthropic = provider(
        ConnectionKind::Anthropic,
        client,
        "https://api.anthropic.com/v1".to_string(),
        key,
    );
}

