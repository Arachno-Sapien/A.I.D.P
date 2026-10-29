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

