#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::mcp::client::CallResult;
use aidp_lib::mcp::hub::Hub;
use aidp_lib::mcp::{McpError, ServerConfig};
use common::TempDir;
use serde_json::json;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fake-mcp.mjs");

fn fake(mode: &str) -> ServerConfig {
    ServerConfig {
        id: 1,
        name: "fake".to_string(),
        command: format!("node \"{FIXTURE}\" {mode}"),
        enabled: true,
        auto_approve: false,
    }
}

#[tokio::test]
async fn start_lists_tools() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    let count = hub.start(&fake(""), &cancel).await.unwrap();
    assert_eq!(count, 3);
    assert!(hub.is_running(1).await);
    assert!(dir.path().join("fake").exists());

    let specs = hub.specs(&[1]).await;
    let names: Vec<&str> = specs.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(
        names,
        vec!["mcp__fake__echo", "mcp__fake__slow", "mcp__fake__die"]
    );
    assert!(hub.specs(&[2]).await.is_empty());

    let again = hub.start(&fake(""), &cancel).await.unwrap();
    assert_eq!(again, 3);
    assert!(hub.is_running(1).await);

    hub.stop_all().await;
}

#[tokio::test]
async fn call_round_trip() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let res = hub
        .call(
            "mcp__fake__echo",
            json!({"text": "hello"}),
            Duration::from_secs(5),
            &cancel,
        )
        .await
        .unwrap();
    assert_eq!(
        res,
        CallResult {
            text: "hello".to_string(),
            is_error: false,
        }
    );

    hub.stop_all().await;
}

#[tokio::test]
async fn unknown_names_are_refused() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let e1 = hub
        .call("mcp__nope__x", json!({}), Duration::from_secs(5), &cancel)
        .await
        .unwrap_err();
    let e2 = hub
        .call("mcp__fake__nope", json!({}), Duration::from_secs(5), &cancel)
        .await
        .unwrap_err();
    assert!(matches!(e1, McpError::Protocol { .. }));
    assert!(matches!(e2, McpError::Protocol { .. }));

    hub.stop_all().await;
}

#[tokio::test]
async fn bad_command_reports_stderr() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    let bad = ServerConfig {
        id: 1,
        name: "bad".to_string(),
        command: "node -e \"console.error('boom'); process.exit(1)\"".to_string(),
        enabled: true,
        auto_approve: false,
    };
    let err = hub.start(&bad, &cancel).await.unwrap_err();
    match err {
        McpError::Closed { stderr } => assert!(
            stderr.contains("boom"),
            "expected stderr to contain 'boom', got: {stderr:?}"
        ),
        other => panic!("expected Closed, got: {other:?}"),
    }
    assert!(!hub.is_running(1).await);
}

#[tokio::test]
async fn server_death_fails_call_and_restarts() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let err = tokio::time::timeout(
        Duration::from_secs(5),
        hub.call("mcp__fake__die", json!({}), Duration::from_secs(5), &cancel),
    )
    .await
    .unwrap()
    .unwrap_err();

    match err {
        McpError::Closed { stderr } => assert!(
            stderr.contains("asked to die"),
            "expected stderr to contain 'asked to die', got: {stderr:?}"
        ),
        other => panic!("expected Closed, got: {other:?}"),
    }
    assert!(!hub.is_running(1).await);

    let count = hub.start(&fake(""), &cancel).await.unwrap();
    assert_eq!(count, 3);
    let echo = hub
        .call(
            "mcp__fake__echo",
            json!({"text": "back"}),
            Duration::from_secs(5),
            &cancel,
        )
        .await
        .unwrap();
    assert_eq!(echo.text, "back");

    hub.stop_all().await;
}

#[tokio::test]
async fn slow_call_times_out() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let err = hub
        .call(
            "mcp__fake__slow",
            json!({}),
            Duration::from_millis(300),
            &cancel,
        )
        .await
        .unwrap_err();
    assert_eq!(err, McpError::Timeout);
    assert!(hub.is_running(1).await);

    let echo = hub
        .call(
            "mcp__fake__echo",
            json!({"text": "ok"}),
            Duration::from_secs(5),
            &cancel,
        )
        .await
        .unwrap();
    assert_eq!(echo.text, "ok");

    hub.stop_all().await;
}

#[tokio::test]
async fn stop_during_start_kills_the_process() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    let h = hub.clone();
    let c = cancel.clone();
    let task = tokio::spawn(async move { h.start(&fake("silent"), &c).await });

    tokio::time::sleep(Duration::from_millis(300)).await;
    cancel.cancel();

    let res = tokio::time::timeout(Duration::from_secs(5), task)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(res, Err(McpError::Stopped));
    assert!(!hub.is_running(1).await);
}

#[tokio::test]
async fn stop_idle_stops_only_idle_servers() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    hub.stop_idle(Duration::from_secs(60)).await;
    assert!(hub.is_running(1).await);

    hub.stop_idle(Duration::ZERO).await;
    assert!(!hub.is_running(1).await);
}

#[tokio::test]
async fn a_server_held_by_a_run_is_never_idle() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let hold = hub.hold(&[1]);
    // A run can spend over 10 minutes on commands between browser calls.
    hub.stop_idle(Duration::ZERO).await;
    assert!(hub.is_running(1).await);

    drop(hold);
    hub.stop_idle(Duration::ZERO).await;
    assert!(!hub.is_running(1).await);
}

#[tokio::test]
async fn stop_still_stops_a_held_server() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();

    hub.start(&fake(""), &cancel).await.unwrap();
    let _hold = hub.hold(&[1]);
    hub.stop(1).await;
    assert!(!hub.is_running(1).await);
}

#[tokio::test]
async fn changed_command_restarts() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel1 = CancellationToken::new();

    hub.start(&fake(""), &cancel1).await.unwrap();
    assert!(hub.is_running(1).await);

    let cancel2 = CancellationToken::new();
    let h = hub.clone();
    let c2 = cancel2.clone();
    let task = tokio::spawn(async move { h.start(&fake("silent"), &c2).await });

    tokio::time::sleep(Duration::from_millis(300)).await;
    cancel2.cancel();

    let res = tokio::time::timeout(Duration::from_secs(5), task)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(res, Err(McpError::Stopped));
    assert!(!hub.is_running(1).await);
}


/// Remove or turn off while a start is still in progress: the start must not
/// add the server afterwards (it would run on, and answer for a newer server
/// with the same name).
#[tokio::test]
async fn stop_during_start_wins() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let starting = {
        let hub = hub.clone();
        tokio::spawn(async move { hub.start(&fake("slowinit"), &CancellationToken::new()).await })
    };
    tokio::time::sleep(Duration::from_millis(250)).await;
    hub.stop(1).await;

    assert_eq!(starting.await.unwrap(), Err(McpError::Stopped));
    assert!(!hub.is_running(1).await);

    // A later start of the same server is not affected by the old stop.
    assert_eq!(hub.start(&fake(""), &CancellationToken::new()).await, Ok(3));
    hub.stop_all().await;
}
