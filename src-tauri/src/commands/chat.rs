use crate::connections::{AppError, Services};
use crate::gateway::{ChatEvent, ChatMessage};
use std::sync::{Mutex, PoisonError};
use tauri::ipc::Channel;
use tauri::State;
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

#[tauri::command]
#[specta::specta]
pub async fn send_message(
    chat: State<'_, ChatState>,
    services: State<'_, Services>,
    connection_id: u32,
    model_id: String,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
) -> Result<(), AppError> {
    let cancel = chat.begin();
    let result = services
        .stream(connection_id, model_id, messages, on_event.clone(), cancel)
        .await;

    match result {
        Ok(usage) => {
            let _ = on_event.send(ChatEvent::Done(usage));
            Ok(())
        }
        Err(AppError::Provider { error }) => {
            let _ = on_event.send(ChatEvent::Error(error));
            Ok(())
        }
        Err(cmd_err) => Err(cmd_err),
    }
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
