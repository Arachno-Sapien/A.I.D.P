#![allow(dead_code, clippy::unwrap_used)]

use aidp_lib::gateway::{ChatEvent, ChatMessage, ChatRequest, Role};
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};

pub fn capture() -> (Channel<ChatEvent>, Arc<Mutex<Vec<ChatEvent>>>) {
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

pub fn deltas(events: &Mutex<Vec<ChatEvent>>) -> Vec<String> {
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

pub fn req() -> ChatRequest {
    ChatRequest {
        model: "test-model".to_string(),
        messages: vec![ChatMessage {
            role: Role::User,
            content: "hi".to_string(),
        }],
        tools: vec![],
        rounds: vec![],
    }
}

pub fn sse(payloads: &[&str]) -> String {
    payloads
        .iter()
        .map(|p| format!("data: {p}\n\n"))
        .collect::<Vec<_>>()
        .join("")
}

pub fn events(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(ev, data)| format!("event: {ev}\ndata: {data}\n\n"))
        .collect::<Vec<_>>()
        .join("")
}

pub struct TempDir {
    path: std::path::PathBuf,
}

impl TempDir {
    pub fn new() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("aidp-test-{pid}-{nanos}"));
        std::fs::create_dir_all(&path).unwrap();
        Self {
            path: std::fs::canonicalize(path).unwrap(),
        }
    }

    pub fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

pub fn link_dir(link: &std::path::Path, target: &std::path::Path) {
    #[cfg(windows)]
    {
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .status()
            .unwrap();
        assert!(status.success(), "mklink /J failed");
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).unwrap();
    }
}

/// Returns false when the OS refuses (Windows needs admin or Developer Mode for file symlinks).
pub fn link_file(link: &std::path::Path, target: &std::path::Path) -> bool {
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(target, link).is_ok()
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).is_ok()
    }
}

