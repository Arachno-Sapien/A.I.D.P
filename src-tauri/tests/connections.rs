#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::connections::{AppError, NewConnection, Services};
use aidp_lib::db;
use aidp_lib::gateway::{
    ChatMessage, ConnectionKind, ModelInfo, ProviderError, Role, Usage,
};
use aidp_lib::secrets::{MemoryStore, SecretStore};
use common::{capture, capture_pull, deltas, events, sse};
use secrecy::ExposeSecret;
use serde_json::json;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const CANARY: &str = "sk-canary-0123456789abcdef";

fn create_services(
    store: Arc<dyn SecretStore>,
) -> Services {
    let conn = db::open_in_memory().unwrap();
    Services::new(conn, store, reqwest::Client::new())
}

#[tokio::test]
async fn add_connection_tests_saves_and_returns_models() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [
                {"id": "model-1", "name": "Model One"},
                {"id": "model-2", "name": "Model Two"}
            ]
        })))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "OpenAI".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: CANARY.to_string(),
    };

    let result = services.add_connection(input).await.unwrap();
    assert_eq!(result.connection.label, "OpenAI");
    assert_eq!(result.connection.key_hint, "cdef");
    assert_eq!(result.connection.last_test_ok, Some(true));
    assert!(store.contains(result.connection.id));
    assert_eq!(result.available.len(), 2);
    assert_eq!(result.available[0].id, "model-1");
    assert_eq!(result.available[1].id, "model-2");
}

#[tokio::test]
async fn failed_test_saves_nothing() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Failed Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-bad-key".to_string(),
    };

    let err = services.add_connection(input).await.unwrap_err();
    assert_eq!(
        err,
        AppError::Provider {
            error: ProviderError::InvalidKey,
        }
    );
    assert!(services.list_connections().unwrap().is_empty());
    assert_eq!(store.len(), 0);
}

#[tokio::test]
async fn keychain_failure_rolls_back_the_row() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::failing());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Test".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-any-key-1234".to_string(),
    };

    let err = services.add_connection(input).await.unwrap_err();
    assert!(matches!(err, AppError::Keychain { .. }));
    assert!(services.list_connections().unwrap().is_empty());
}

#[tokio::test]
async fn insecure_url_is_refused_before_any_request() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Insecure".to_string(),
        base_url: "http://api.example.com/v1".to_string(),
        api_key: "sk-test-12345678".to_string(),
    };

    let err = services.add_connection(input).await.unwrap_err();
    assert_eq!(
        err,
        AppError::InsecureUrl {
            url: "http://api.example.com/v1".to_string(),
        }
    );
}

#[tokio::test]
async fn blank_label_or_key_is_invalid_input() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input1 = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "   ".to_string(),
        base_url: "https://api.openai.com/v1".to_string(),
        api_key: "sk-test-12345678".to_string(),
    };
    let err1 = services.add_connection(input1).await.unwrap_err();
    assert!(matches!(err1, AppError::InvalidInput { .. }));

    let input2 = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Valid".to_string(),
        base_url: "https://api.openai.com/v1".to_string(),
        api_key: "".to_string(),
    };
    let err2 = services.add_connection(input2).await.unwrap_err();
    assert!(matches!(err2, AppError::InvalidInput { .. }));
}

#[tokio::test]
async fn views_never_contain_the_key() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Canary Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: CANARY.to_string(),
    };

    let debug_str = format!("{input:?}");
    assert!(debug_str.contains("[REDACTED]"));
    assert!(!debug_str.contains(CANARY));

    let added = services.add_connection(input).await.unwrap();
    let added_json = serde_json::to_string(&added).unwrap();
    assert!(!added_json.contains(CANARY));

    let view_json = serde_json::to_string(&added.connection).unwrap();
    assert!(!view_json.contains(CANARY));

    let list = services.list_connections().unwrap();
    let list_json = serde_json::to_string(&list).unwrap();
    assert!(!list_json.contains(CANARY));
}

#[tokio::test]
async fn key_is_not_in_the_database_file() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let temp_dir =
        std::env::temp_dir().join(format!("aidp-test-{}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&temp_dir).unwrap();
    let db_path = temp_dir.join("test.db");

    let db_conn = db::open(&db_path).unwrap();
    let store = Arc::new(MemoryStore::default());
    let services = Services::new(db_conn, store, reqwest::Client::new());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Canary Disk".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: CANARY.to_string(),
    };
    services.add_connection(input).await.unwrap();
    drop(services);

    // Read all files in temp_dir and assert canary bytes are not present
    for entry in std::fs::read_dir(&temp_dir).unwrap() {
        let entry = entry.unwrap();
        let bytes = std::fs::read(entry.path()).unwrap();
        let canary_bytes = CANARY.as_bytes();
        let found = bytes.windows(canary_bytes.len()).any(|w| w == canary_bytes);
        assert!(!found, "Canary was found in file: {:?}", entry.path());
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_connection_records_the_result() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Test Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-test-key-1234".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    // Reset mock server to return 401
    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let err = services.test_connection(id).await.unwrap_err();
    assert_eq!(
        err,
        AppError::Provider {
            error: ProviderError::InvalidKey,
        }
    );

    let view = services.list_connections().unwrap().into_iter().find(|c| c.id == id).unwrap();
    assert_eq!(view.last_test_ok, Some(false));
}

#[tokio::test]
async fn replace_key_swaps_after_a_good_test() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Swap Key".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-old-0123456789abcdef".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("authorization", "Bearer sk-new-0123456789abcdef"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let updated = services
        .replace_key(id, "sk-new-0123456789abcdef".to_string())
        .await
        .unwrap();

    assert_eq!(updated.key_hint, "cdef");
    assert_eq!(
        store.get(id).unwrap().expose_secret(),
        "sk-new-0123456789abcdef"
    );
}

#[tokio::test]
async fn keys_are_trimmed_before_saving() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("authorization", "Bearer sk-pad-0123456789abcdef"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Pasted".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "  sk-pad-0123456789abcdef\n".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;
    assert_eq!(added.connection.key_hint, "cdef");
    assert_eq!(
        store.get(id).unwrap().expose_secret(),
        "sk-pad-0123456789abcdef"
    );

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("authorization", "Bearer sk-new-0123456789abcdef"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let updated = services
        .replace_key(id, "\tsk-new-0123456789abcdef \r\n".to_string())
        .await
        .unwrap();
    assert_eq!(updated.key_hint, "cdef");
    assert_eq!(
        store.get(id).unwrap().expose_secret(),
        "sk-new-0123456789abcdef"
    );
}

#[tokio::test]
async fn failed_replace_keeps_old_key() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Keep Key".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-old-0123456789abcdef".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let err = services
        .replace_key(id, "sk-bad-key".to_string())
        .await
        .unwrap_err();
    assert_eq!(
        err,
        AppError::Provider {
            error: ProviderError::InvalidKey,
        }
    );
    assert_eq!(
        store.get(id).unwrap().expose_secret(),
        "sk-old-0123456789abcdef"
    );
}

#[tokio::test]
async fn delete_removes_row_models_and_keychain_entry() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "To Delete".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-test-key-1234".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    services
        .set_models(
            id,
            vec![ModelInfo {
                id: "m1".to_string(),
                display_name: "M1".to_string(),
                context_window: None,
                supports_tools: None,
            }],
        )
        .unwrap();

    services.delete_connection(id).unwrap();

    assert!(services.list_connections().unwrap().is_empty());
    assert!(services.chat_models().unwrap().is_empty());
    assert!(!store.contains(id));

    let err = services.delete_connection(id).unwrap_err();
    assert_eq!(err, AppError::NotFound);
}

#[tokio::test]
async fn delete_works_when_the_entry_is_already_gone() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Gone Entry".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-test-key-1234".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    store.remove(id);

    let res = services.delete_connection(id);
    assert!(res.is_ok());
    assert!(services.list_connections().unwrap().is_empty());
}

#[tokio::test]
async fn set_models_default_and_chat_models() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-test-key-1234".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    services
        .set_models(
            id,
            vec![
                ModelInfo {
                    id: "m1".to_string(),
                    display_name: "Model One".to_string(),
                    context_window: None,
                    supports_tools: None,
                },
                ModelInfo {
                    id: "m2".to_string(),
                    display_name: "Model Two".to_string(),
                    context_window: None,
                    supports_tools: None,
                },
            ],
        )
        .unwrap();

    services.set_default_model(id, "m2".to_string()).unwrap();

    let models = services.chat_models().unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].model_id, "m2");
    assert!(models[0].is_default);
    assert_eq!(models[1].model_id, "m1");
    assert!(!models[1].is_default);

    let unknown_err = services.set_models(99999, vec![]).unwrap_err();
    assert_eq!(unknown_err, AppError::NotFound);
}

#[tokio::test]
async fn stream_uses_the_stored_key() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Stream Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-stream-secret-key".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    let sse_body = sse(&[
        r#"{"choices":[{"delta":{"content":"Hi"}}]}"#,
        r#"{"choices":[{"delta":{"content":" there"}}]}"#,
        "[DONE]",
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("authorization", "Bearer sk-stream-secret-key"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body),
        )
        .mount(&server)
        .await;

    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let usage = services
        .stream(
            id,
            "test-model".to_string(),
            vec![ChatMessage {
                role: Role::User,
                content: "Hello".to_string(),
            }],
            channel,
            cancel,
        )
        .await
        .unwrap();

    assert_eq!(deltas(&events_log), vec!["Hi", " there"]);
    assert_eq!(usage, Usage::default());
}

#[tokio::test]
async fn missing_key_is_reported() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());

    let input = NewConnection {
        kind: ConnectionKind::OpenaiCompat,
        label: "Missing Key Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-test-key-1234".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    store.remove(id);

    let (channel, _) = capture();
    let cancel = CancellationToken::new();
    let err = services
        .stream(id, "model".to_string(), vec![], channel, cancel)
        .await
        .unwrap_err();

    assert_eq!(err, AppError::KeyMissing);
}

#[tokio::test]
async fn anthropic_connections_use_the_anthropic_adapter() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("x-api-key", "sk-ant-stream-key"))
        .and(header("anthropic-version", "2026-10-21"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": []})))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let input = NewConnection {
        kind: ConnectionKind::Anthropic,
        label: "Anthropic Conn".to_string(),
        base_url: format!("{}/v1", server.uri()),
        api_key: "sk-ant-stream-key".to_string(),
    };
    let added = services.add_connection(input).await.unwrap();
    let id = added.connection.id;

    let body = events(&[
        (
            "message_start",
            r#"{"type":"message_start","message":{"usage":{"input_tokens":5}}}"#,
        ),
        (
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Claude reply"}}"#,
        ),
        ("message_stop", r#"{"type":"message_stop"}"#),
    ]);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "sk-ant-stream-key"))
        .and(header("anthropic-version", "2026-10-21"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(body),
        )
        .mount(&server)
        .await;

    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let usage = services
        .stream(
            id,
            "claude-3".to_string(),
            vec![ChatMessage {
                role: Role::User,
                content: "Hi".to_string(),
            }],
            channel,
            cancel,
        )
        .await
        .unwrap();

    assert_eq!(deltas(&events_log), vec!["Claude reply"]);
    assert_eq!(usage.tokens_in, Some(5));
}

#[tokio::test]
async fn ollama_connection_is_created_once() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone());
    let id1 = services.ensure_ollama_connection().unwrap();
    let id2 = services.ensure_ollama_connection().unwrap();
    assert_eq!(id1, id2);

    let conns = services.list_connections().unwrap();
    assert_eq!(conns.len(), 1);
    assert_eq!(conns[0].id, id1);
    assert_eq!(conns[0].kind, ConnectionKind::Ollama);
    assert_eq!(conns[0].key_hint, "");
    assert_eq!(store.len(), 0);
}

#[tokio::test]
async fn sync_reads_tools_and_context() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {"name": "a:1b", "size": 1_000_000, "details": {"parameter_size": "1B", "quantization_level": "Q4"}},
                {"name": "b:2b", "size": 2_000_000, "details": {"parameter_size": "2B", "quantization_level": "Q4"}}
            ]
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/show"))
        .and(wiremock::matchers::body_json(json!({"model": "a:1b"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": ["tools"],
            "model_info": {"qwen2.context_length": 32768}
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/show"))
        .and(wiremock::matchers::body_json(json!({"model": "b:2b"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": [],
            "model_info": {}
        })))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());
    services.sync_local_models().await.unwrap();

    let models = services.chat_models().unwrap();
    assert_eq!(models.len(), 2);

    let model_a = models.iter().find(|m| m.model_id == "a:1b").unwrap();
    assert_eq!(model_a.supports_tools, Some(true));
    assert!(model_a.is_local);
    assert_eq!(model_a.context_tokens, Some(8192));

    let model_b = models.iter().find(|m| m.model_id == "b:2b").unwrap();
    assert_eq!(model_b.supports_tools, Some(false));
    assert!(model_b.is_local);
    assert_eq!(model_b.context_tokens, Some(8192));
}

#[tokio::test]
async fn sync_keeps_default_and_num_ctx() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {"name": "a:1b", "size": 1_000_000, "details": {}},
                {"name": "b:2b", "size": 2_000_000, "details": {}}
            ]
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/show"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": ["tools"],
            "model_info": {"context_length": 32768}
        })))
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());
    services.sync_local_models().await.unwrap();

    let conn_id = services.ensure_ollama_connection().unwrap();
    services.set_default_model(conn_id, "a:1b".to_string()).unwrap();
    services.set_model_context("a:1b", 4096).unwrap();

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {"name": "a:1b", "size": 1_000_000, "details": {}},
                {"name": "c:3b", "size": 3_000_000, "details": {}}
            ]
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/show"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": ["tools"],
            "model_info": {"context_length": 32768}
        })))
        .mount(&server)
        .await;

    services.sync_local_models().await.unwrap();

    let models = services.chat_models().unwrap();
    assert_eq!(models.len(), 2);
    let model_a = models.iter().find(|m| m.model_id == "a:1b").unwrap();
    assert!(model_a.is_default);
    assert_eq!(model_a.context_tokens, Some(4096));

    assert!(models.iter().all(|m| m.model_id != "b:2b"));
    assert!(models.iter().any(|m| m.model_id == "c:3b"));
}

#[tokio::test]
async fn provider_for_ollama_needs_no_key() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("{\"message\":{\"role\":\"assistant\",\"content\":\"Local hi\"}}\n{\"done\":true}\n"),
        )
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = create_services(store.clone()).with_ollama_url(server.uri());
    let id = services.ensure_ollama_connection().unwrap();

    let (channel, events_log) = capture();
    let cancel = CancellationToken::new();

    let _ = services
        .stream(
            id,
            "llama3:8b".to_string(),
            vec![ChatMessage {
                role: Role::User,
                content: "Hi".to_string(),
            }],
            channel,
            cancel,
        )
        .await
        .unwrap();

    assert_eq!(deltas(&events_log), vec!["Local hi"]);
    assert_eq!(store.len(), 0);
}

#[tokio::test]
async fn model_options_defaults() {
    let server = MockServer::start().await;
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());
    let conn_id = services.ensure_ollama_connection().unwrap();

    services
        .set_models(
            conn_id,
            vec![
                ModelInfo {
                    id: "large:32k".to_string(),
                    display_name: "large:32k".to_string(),
                    supports_tools: Some(true),
                    context_window: Some(32768),
                },
                ModelInfo {
                    id: "small:4k".to_string(),
                    display_name: "small:4k".to_string(),
                    supports_tools: Some(true),
                    context_window: Some(4096),
                },
            ],
        )
        .unwrap();

    let opts = services.model_options(conn_id, "large:32k");
    assert_eq!(opts.num_ctx, Some(8192));

    let opts = services.model_options(conn_id, "small:4k");
    assert_eq!(opts.num_ctx, Some(4096));

    services.set_model_context("large:32k", 16384).unwrap();
    let opts = services.model_options(conn_id, "large:32k");
    assert_eq!(opts.num_ctx, Some(16384));

    let cloud_id = {
        let db = services.db_conn().unwrap();
        db::connections::insert_connection(
            &db,
            ConnectionKind::OpenaiCompat,
            "Cloud",
            "https://api.openai.com/v1",
            "1234",
            1,
        )
        .unwrap()
    };
    let opts = services.model_options(cloud_id, "gpt-4o");
    assert_eq!(opts.num_ctx, None);
}

#[tokio::test]
async fn set_model_context_bounds() {
    let server = MockServer::start().await;
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());
    let conn_id = services.ensure_ollama_connection().unwrap();

    services
        .set_models(
            conn_id,
            vec![ModelInfo {
                id: "local:16k".to_string(),
                display_name: "local:16k".to_string(),
                supports_tools: Some(true),
                context_window: Some(16384),
            }],
        )
        .unwrap();

    let err = services.set_model_context("local:16k", 1024).unwrap_err();
    assert!(matches!(err, AppError::InvalidInput { .. }));

    let err = services.set_model_context("local:16k", 32768).unwrap_err();
    assert!(matches!(err, AppError::InvalidInput { .. }));

    let cloud_id = {
        let db = services.db_conn().unwrap();
        db::connections::insert_connection(
            &db,
            ConnectionKind::OpenaiCompat,
            "Cloud",
            "https://api.openai.com/v1",
            "1234",
            1,
        )
        .unwrap()
    };
    services
        .set_models(
            cloud_id,
            vec![ModelInfo {
                id: "gpt-4o".to_string(),
                display_name: "gpt-4o".to_string(),
                supports_tools: Some(true),
                context_window: Some(128_000),
            }],
        )
        .unwrap();
    let err = services.set_model_context("gpt-4o", 8192).unwrap_err();
    assert!(matches!(err, AppError::InvalidInput { .. }));
}

#[tokio::test]
async fn set_model_context_targets_the_local_model() {
    // A cloud model with the same name must not be picked instead of the local one.
    let server = MockServer::start().await;
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());
    let cloud_id = {
        let db = services.db_conn().unwrap();
        db::connections::insert_connection(
            &db,
            ConnectionKind::OpenaiCompat,
            "Cloud",
            "https://api.openai.com/v1",
            "1234",
            1,
        )
        .unwrap()
    };
    let same = |cw| ModelInfo {
        id: "same:1b".to_string(),
        display_name: "same:1b".to_string(),
        supports_tools: Some(true),
        context_window: Some(cw),
    };
    services.set_models(cloud_id, vec![same(4096)]).unwrap();
    let local_id = services.ensure_ollama_connection().unwrap();
    services.set_models(local_id, vec![same(32768)]).unwrap();

    services.set_model_context("same:1b", 16384).unwrap();

    let models = services.chat_models().unwrap();
    let local = models.iter().find(|m| m.is_local).unwrap();
    assert_eq!(local.context_tokens, Some(16384));
}

#[tokio::test]
async fn local_model_names_are_checked() {
    // Every request with a model name from the UI checks the name first (plan, Global Constraints).
    let server = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200))
        .expect(0)
        .mount(&server)
        .await;
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store).with_ollama_url(server.uri());

    for name in ["a b", "x;y", ""] {
        assert!(
            matches!(services.delete_local_model(name).await, Err(AppError::InvalidInput { .. })),
            "delete {name:?}"
        );
        assert!(
            matches!(services.unload_local_model(name).await, Err(AppError::InvalidInput { .. })),
            "unload {name:?}"
        );
    }
}

#[tokio::test]
async fn ollama_row_cannot_be_deleted() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);
    let conn_id = services.ensure_ollama_connection().unwrap();

    let err = services.delete_connection(conn_id).unwrap_err();
    assert_eq!(
        err,
        AppError::InvalidInput {
            message: "Ollama is managed on the Local panel.".to_string(),
        }
    );
}

#[tokio::test]
async fn pull_refuses_bad_names_and_a_second_pull() {
    use aidp_lib::commands::ollama::{self, OllamaState};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/pull"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(300))
                .set_body_string("{\"status\":\"success\"}\n"),
        )
        .mount(&server)
        .await;

    let store = Arc::new(MemoryStore::default());
    let services = Arc::new(create_services(store).with_ollama_url(server.uri()));
    let state = Arc::new(OllamaState::default());

    let (ch1, _) = capture_pull();
    let err = ollama::ollama_pull_impl(&services, &state, "a b".to_string(), ch1)
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::InvalidInput { .. }));

    let (ch2, _) = capture_pull();
    let s_clone = services.clone();
    let st_clone = state.clone();
    let task = tokio::spawn(async move {
        ollama::ollama_pull_impl(&s_clone, &st_clone, "m1:latest".to_string(), ch2).await
    });

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let (ch3, _) = capture_pull();
    let err2 = ollama::ollama_pull_impl(&services, &state, "m2:latest".to_string(), ch3)
        .await
        .unwrap_err();
    assert_eq!(
        err2,
        AppError::InvalidInput {
            message: "A download is already running.".to_string(),
        }
    );

    task.await.unwrap().unwrap();
}
