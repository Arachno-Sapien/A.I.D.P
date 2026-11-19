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
            1,
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
            images: vec![],
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
        .call(1, "mcp__nope__x", json!({}), Duration::from_secs(5), &cancel)
        .await
        .unwrap_err();
    let e2 = hub
        .call(1, "mcp__fake__nope", json!({}), Duration::from_secs(5), &cancel)
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
        hub.call(1, "mcp__fake__die", json!({}), Duration::from_secs(5), &cancel),
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
            1,
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
            1,
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
            1,
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

/// Test in Settings works on a server that is turned off, but must not leave it
/// running: off means stopped (outside-tool rule 4). One that is on stays up for
/// the agent run that usually follows.
#[tokio::test]
async fn testing_a_turned_off_server_leaves_it_stopped() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());

    let off = ServerConfig {
        enabled: false,
        ..fake("")
    };
    let tools = hub.test(&off).await.unwrap();
    assert_eq!(tools, vec!["echo", "slow", "die"]);
    assert!(!hub.is_running(1).await);

    let tools = hub.test(&fake("")).await.unwrap();
    assert_eq!(tools, vec!["echo", "slow", "die"]);
    assert!(hub.is_running(1).await);

    hub.stop_all().await;
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

    // Turned on again, a later start is not affected by the old stop.
    hub.turn_on(1);
    assert_eq!(hub.start(&fake(""), &CancellationToken::new()).await, Ok(3));
    hub.stop_all().await;
}

/// An agent run reads the server list before it starts each server in turn, so a
/// server turned off or removed meanwhile (stopped before its start) must not start.
#[tokio::test]
async fn a_server_stopped_before_its_start_does_not_start() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    hub.stop(1).await;
    assert_eq!(
        hub.start(&fake(""), &CancellationToken::new()).await,
        Err(McpError::Stopped)
    );
    assert!(!hub.is_running(1).await);

    // Test in Settings still works on it, and leaves it stopped.
    let off = ServerConfig { enabled: false, ..fake("") };
    assert_eq!(hub.test(&off).await.unwrap().len(), 3);
    assert!(!hub.is_running(1).await);

    hub.turn_on(1);
    assert_eq!(hub.start(&fake(""), &CancellationToken::new()).await, Ok(3));
    hub.stop_all().await;
}

/// Test pressed while a run starts the same server: one process, and the second
/// start must not kill the first one's process (a run may be using it).
#[tokio::test]
async fn two_starts_of_one_server_spawn_one_process() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let first = {
        let hub = hub.clone();
        tokio::spawn(async move { hub.start(&fake("slowinit"), &CancellationToken::new()).await })
    };
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(hub.test(&fake("slowinit")).await.unwrap().len(), 3);
    assert_eq!(first.await.unwrap(), Ok(3));
    assert!(hub.is_running(1).await);

    let log = std::fs::read_to_string(dir.path().join("fake").join("spawned.txt")).unwrap();
    assert_eq!(log.lines().count(), 1, "spawned: {log}");
    hub.stop_all().await;
}

/// Test read the server as off, but the user turned it on and a run now uses it:
/// Test must not stop the process the run holds.
#[tokio::test]
async fn test_does_not_stop_a_server_a_run_holds() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let _hold = hub.hold(&[1]);
    hub.start(&fake(""), &CancellationToken::new()).await.unwrap();

    let stale = ServerConfig { enabled: false, ..fake("") };
    assert_eq!(hub.test(&stale).await.unwrap().len(), 3);
    assert!(hub.is_running(1).await);
    hub.stop_all().await;
}

/// A run holds the server, the user turns it off (so the run's start is refused), then
/// presses Test: Test must not leave it running for the run, which could then call it.
#[tokio::test]
async fn test_stops_a_turned_off_server_even_when_a_run_holds_it() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();
    let _hold = hub.hold(&[1]);
    hub.stop(1).await;
    assert!(matches!(hub.start(&fake(""), &cancel).await, Err(McpError::Stopped)));

    let off = ServerConfig { enabled: false, ..fake("") };
    assert_eq!(hub.test(&off).await.unwrap().len(), 3);
    assert!(!hub.is_running(1).await);
    let call = hub
        .call(1, "mcp__fake__echo", json!({"text": "x"}), Duration::from_secs(5), &cancel)
        .await;
    assert!(matches!(call, Err(McpError::Protocol { .. })), "{call:?}");
    hub.stop_all().await;
}

/// A call goes to the server the run started, by id: a newer server that took the
/// same name (removed and added again) must not answer it.
#[tokio::test]
async fn a_call_reaches_only_the_server_the_run_started() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let cancel = CancellationToken::new();
    hub.start(&fake(""), &cancel).await.unwrap();
    hub.stop(1).await;
    let newer = ServerConfig { id: 2, ..fake("") };
    hub.start(&newer, &cancel).await.unwrap();

    let echo = json!({"text": "x"});
    let old = hub
        .call(1, "mcp__fake__echo", echo.clone(), Duration::from_secs(5), &cancel)
        .await;
    assert!(matches!(old, Err(McpError::Protocol { .. })), "{old:?}");
    let res = hub
        .call(2, "mcp__fake__echo", echo, Duration::from_secs(5), &cancel)
        .await
        .unwrap();
    assert_eq!(res.text, "x");
    hub.stop_all().await;
}

/// The pid of each process the fixture spawned for server "fake", in order.
fn spawned(dir: &std::path::Path) -> Vec<u32> {
    std::fs::read_to_string(dir.join("fake").join("spawned.txt"))
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().parse().unwrap())
        .collect()
}

fn alive(pid: u32) -> bool {
    let script = format!("try {{ process.kill({pid}, 0); process.exit(0) }} catch {{ process.exit(1) }}");
    std::process::Command::new("node").args(["-e", &script]).status().unwrap().success()
}

/// Waits until the fixture has spawned `n` processes.
async fn wait_spawned(dir: &std::path::Path, n: usize) -> Vec<u32> {
    for _ in 0..100 {
        let pids = spawned(dir);
        if pids.len() >= n {
            return pids;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the fixture did not start");
}

/// Cancel on a Test of a server that never answers ends it at once and kills the process.
#[tokio::test]
async fn cancel_test_ends_a_test_of_a_silent_server() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let h = hub.clone();
    let task = tokio::spawn(async move { h.test(&fake("silent")).await });
    let pid = wait_spawned(dir.path(), 1).await[0];

    hub.cancel_test(1);
    let res = tokio::time::timeout(Duration::from_secs(5), task).await.unwrap().unwrap();
    assert_eq!(res, Err(McpError::Stopped));
    assert!(!hub.is_running(1).await);
    assert!(!alive(pid), "process {pid} still runs");
}

/// Off or Remove during Test ends the Test at once too.
#[tokio::test]
async fn stop_ends_a_test_in_flight() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let h = hub.clone();
    let task = tokio::spawn(async move { h.test(&fake("silent")).await });
    let pid = wait_spawned(dir.path(), 1).await[0];

    hub.stop(1).await;
    let res = tokio::time::timeout(Duration::from_secs(5), task).await.unwrap().unwrap();
    assert_eq!(res, Err(McpError::Stopped));
    assert!(!hub.is_running(1).await);
    assert!(!alive(pid), "process {pid} still runs");
}

/// An older Test that ends while a newer one waits must not take the newer one's Cancel.
#[tokio::test]
async fn an_older_test_does_not_remove_a_newer_tests_cancel() {
    let dir = TempDir::new();
    let hub = Hub::new(dir.path().to_path_buf());
    let h = hub.clone();
    let older = tokio::spawn(async move { h.test(&fake("slowinit")).await });
    wait_spawned(dir.path(), 1).await;
    let h = hub.clone();
    let newer = tokio::spawn(async move { h.test(&fake("silent")).await });

    assert_eq!(older.await.unwrap().unwrap().len(), 3);
    let pid = wait_spawned(dir.path(), 2).await[1];
    hub.cancel_test(1);
    let res = tokio::time::timeout(Duration::from_secs(5), newer).await.unwrap().unwrap();
    assert_eq!(res, Err(McpError::Stopped));
    assert!(!alive(pid), "process {pid} still runs");
    hub.stop_all().await;
}
