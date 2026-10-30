#![allow(clippy::unwrap_used)]

use aidp_lib::gateway::ProviderError;
use aidp_lib::ollama::{valid_model_name, Ollama, PullEvent};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn capture_pull() -> (Channel<PullEvent>, Arc<Mutex<Vec<PullEvent>>>) {
    let events = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&events);
    let channel = Channel::new(move |body| {
        let event: PullEvent = match body {
            InvokeResponseBody::Json(s) => serde_json::from_str(&s).unwrap(),
            InvokeResponseBody::Raw(b) => serde_json::from_slice(&b).unwrap(),
        };
        events_clone.lock().unwrap().push(event);
        Ok(())
    });
    (channel, events)
}

#[tokio::test]
async fn version_and_offline() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/version"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "version": "0.12.0"
        })))
        .mount(&server)
        .await;

    let client = reqwest::Client::new();
    let ollama = Ollama::new(client.clone(), server.uri());
    let ver = ollama.version().await.expect("version");
    assert_eq!(ver, "0.12.0");

    let dead_ollama = Ollama::new(client, "http://127.0.0.1:1".to_string());
    let err = dead_ollama.version().await.expect_err("offline error");
    assert_eq!(err, ProviderError::Offline);
}

#[tokio::test]
async fn tags_parse() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {
                    "name": "qwen2.5-coder:1.5b",
                    "size": 1033895840,
                    "details": {
                        "parameter_size": "1.5B",
                        "quantization_level": "Q4_K_M"
                    }
                },
                {
                    "name": "llama3.2:3b",
                    "size": 2000000000,
                    "details": {
                        "parameter_size": "3B",
                        "quantization_level": "Q4_0"
                    }
                }
            ]
        })))
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let models = ollama.tags().await.expect("tags");
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].name, "qwen2.5-coder:1.5b");
    assert_eq!(models[0].size_mb, 986);
    assert_eq!(models[0].parameter_size, "1.5B");
    assert_eq!(models[0].quantization, "Q4_K_M");

    assert_eq!(models[1].name, "llama3.2:3b");
    assert_eq!(models[1].size_mb, 1908);
    assert_eq!(models[1].parameter_size, "3B");
    assert_eq!(models[1].quantization, "Q4_0");
}

#[tokio::test]
async fn show_reads_tools_and_context() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/show"))
        .and(body_json(json!({ "model": "qwen2.5-coder:1.5b" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": ["completion", "tools"],
            "model_info": {
                "qwen2.context_length": 32768
            }
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/show"))
        .and(body_json(json!({ "model": "basic" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "capabilities": ["completion"],
            "model_info": {}
        })))
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let d1 = ollama.show("qwen2.5-coder:1.5b").await.expect("show qwen");
    assert!(d1.supports_tools);
    assert_eq!(d1.context_length, Some(32768));

    let d2 = ollama.show("basic").await.expect("show basic");
    assert!(!d2.supports_tools);
    assert_eq!(d2.context_length, None);
}

#[tokio::test]
async fn loaded_parse() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {
                    "name": "qwen2.5-coder:1.5b",
                    "size": 1033895840,
                    "size_vram": 524288000,
                    "expires_at": "2026-10-30T20:00:00Z"
                }
            ]
        })))
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let loaded = ollama.loaded().await.expect("loaded");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].name, "qwen2.5-coder:1.5b");
    assert_eq!(loaded[0].size_mb, 986);
    assert_eq!(loaded[0].vram_mb, 500);
    assert_eq!(loaded[0].expires_at, "2026-10-30T20:00:00Z");
}

#[tokio::test]
async fn pull_reports_progress_and_success() {
    let server = MockServer::start().await;
    let ndjson = [
        r#"{"status":"pulling manifest"}"#,
        r#"{"status":"downloading digest-a","digest":"sha256:aaa","total":104857600,"completed":52428800}"#,
        r#"{"status":"downloading digest-b","digest":"sha256:bbb","total":52428800,"completed":26214400}"#,
        r#"{"status":"downloading digest-a","digest":"sha256:aaa","total":104857600,"completed":104857600}"#,
        r#"{"status":"downloading digest-b","digest":"sha256:bbb","total":52428800,"completed":52428800}"#,
        r#"{"status":"verifying sha256 digest"}"#,
        r#"{"status":"success"}"#,
    ]
    .join("\n")
        + "\n";

    Mock::given(method("POST"))
        .and(path("/api/pull"))
        .and(body_json(json!({ "model": "qwen2.5-coder:1.5b", "stream": true })))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "application/x-ndjson")
                .set_body_string(ndjson),
        )
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let (channel, events) = capture_pull();
    let cancel = CancellationToken::new();

    ollama
        .pull("qwen2.5-coder:1.5b", channel, &cancel)
        .await
        .expect("pull success");

    let list = events.lock().unwrap().clone();
    assert!(!list.is_empty());
    // Find event where total reaches 150 MB and completed reaches 150 MB
    let reached = list.iter().any(|ev| match ev {
        PullEvent::Progress {
            total_mb,
            completed_mb,
            ..
        } => *total_mb == 150 && *completed_mb == 150,
    });
    assert!(reached, "progress did not reach 150 MB total and completed");
}

#[tokio::test]
async fn pull_error_line() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/pull"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("{\"error\":\"pull model manifest: file does not exist\"}\n"),
        )
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let (channel, _) = capture_pull();
    let cancel = CancellationToken::new();

    let err = ollama
        .pull("nonexistent", channel, &cancel)
        .await
        .expect_err("pull error");

    match err {
        ProviderError::Provider { message } => {
            assert_eq!(message, "pull model manifest: file does not exist");
        }
        other => panic!("expected Provider error, got {:?}", other),
    }
}

#[tokio::test]
async fn pull_cancel() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/pull"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("{\"status\":\"pulling manifest\"}\n{\"status\":\"downloading\"}\n"),
        )
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let (channel, _) = capture_pull();
    let cancel = CancellationToken::new();
    cancel.cancel(); // Cancel immediately

    let err = ollama
        .pull("model", channel, &cancel)
        .await
        .expect_err("cancelled");
    assert_eq!(err, ProviderError::Cancelled);
}

#[tokio::test]
async fn delete_missing_is_model_not_found() {
    let server = MockServer::start().await;
    Mock::given(method("DELETE"))
        .and(path("/api/delete"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    let err = ollama.delete("missing").await.expect_err("delete 404");
    assert_eq!(err, ProviderError::ModelNotFound);
}

#[tokio::test]
async fn unload_sends_keep_alive_zero() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .and(body_json(json!({
            "model": "m",
            "messages": [],
            "keep_alive": 0
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "done": true })))
        .mount(&server)
        .await;

    let ollama = Ollama::new(reqwest::Client::new(), server.uri());
    ollama.unload("m").await.expect("unload");
}

#[test]
fn valid_model_name_table() {
    assert!(valid_model_name("qwen2.5-coder:1.5b"));
    assert!(valid_model_name("hf.co/u/r:Q4_K_M"));
    assert!(!valid_model_name(""));
    assert!(!valid_model_name(&"a".repeat(201)));
    assert!(!valid_model_name("a b"));
    assert!(!valid_model_name("x;y"));
    assert!(!valid_model_name("a\\b"));
}
