use crate::config::{self, ConfigError, Transport};
use crate::gateway::{
    openai_compat::OpenAiCompat, ChatEvent, ChatMessage, ChatRequest, ModelProvider,
};
use serde::Serialize;
use specta::Type;
use std::sync::{Mutex, PoisonError};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct ChatState {
    current: Mutex<Option<CancellationToken>>,
}

impl ChatState {
    pub fn begin(&self) -> CancellationToken {
        let mut guard = self.current.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(prev) = guard.take() {
            prev.cancel();
        }
        let token = CancellationToken::new();
        *guard = Some(token.clone());
        token
    }

    pub fn stop(&self) {
        let mut guard = self.current.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(token) = guard.take() {
            token.cancel();
        }
    }
}

#[derive(Serialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfigView {
    pub model: String,
    pub host: String,
    pub insecure: bool,
}

#[tauri::command]
#[specta::specta]
pub fn chat_config(app: AppHandle) -> Result<ChatConfigView, ConfigError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ConfigError::Invalid {
            message: e.to_string(),
        })?;
    let cfg = config::load(&config_dir)?;
    let host = reqwest::Url::parse(&cfg.base_url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_else(|| cfg.base_url.clone());
    let insecure = cfg.transport == Transport::LocalHttp;

    Ok(ChatConfigView {
        model: cfg.model,
        host,
        insecure,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, ChatState>,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
) -> Result<(), ConfigError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ConfigError::Invalid {
            message: e.to_string(),
        })?;
    let cfg = config::load(&config_dir)?;
    let provider = OpenAiCompat::new(cfg.base_url, cfg.api_key);
    let cancel = state.begin();
    let req = ChatRequest {
        model: cfg.model,
        messages,
    };

    let result = provider.stream_chat(req, on_event.clone(), cancel).await;
    match result {
        Ok(usage) => {
            let _ = on_event.send(ChatEvent::Done(usage));
        }
        Err(err) => {
            let _ = on_event.send(ChatEvent::Error(err));
        }
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn stop_reply(state: State<'_, ChatState>) {
    state.stop();
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn begin_cancels_previous_reply() {
        let s = ChatState::default();
        let a = s.begin();
        let b = s.begin();
        assert!(a.is_cancelled());
        assert!(!b.is_cancelled());
        s.stop();
        assert!(b.is_cancelled());
    }
}

