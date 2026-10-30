use crate::connections::{AppError, Services};
use crate::gateway::{ChatEvent, ChatMessage};
use crate::tools::approvals::Approvals;
use crate::workspace::WorkspaceState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

#[derive(
    Serialize, Deserialize, specta::Type, Clone, Copy, Debug, PartialEq, Eq, Hash,
)]
#[serde(rename_all = "camelCase")]
pub enum ChatSurface {
    Chat,
    Workspace,
}

#[derive(Default)]
pub struct ChatState {
    current: Mutex<HashMap<ChatSurface, CancellationToken>>,
}

impl ChatState {
    pub fn begin(&self, surface: ChatSurface) -> CancellationToken {
        let mut guard = self.current.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(prev) = guard.remove(&surface) {
            prev.cancel();
        }
        let token = CancellationToken::new();
        guard.insert(surface, token.clone());
        token
    }

    pub fn stop(&self, surface: ChatSurface) {
        let mut guard = self.current.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(token) = guard.remove(&surface) {
            token.cancel();
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn send_message(
    chat: State<'_, ChatState>,
    services: State<'_, Services>,
    surface: ChatSurface,
    connection_id: u32,
    model_id: String,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
) -> Result<(), AppError> {
    let cancel = chat.begin(surface);
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
pub fn stop_reply(state: State<'_, ChatState>, surface: ChatSurface) {
    state.stop(surface);
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn run_agent(
    chat: State<'_, ChatState>,
    services: State<'_, Services>,
    workspace: State<'_, WorkspaceState>,
    approvals: State<'_, Approvals>,
    connection_id: u32,
    model_id: String,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
) -> Result<(), AppError> {
    let root = match workspace.root() {
        Ok(r) => r,
        Err(_) => {
            return Err(AppError::InvalidInput {
                message: "Open a folder first.".to_string(),
            })
        }
    };

    let provider = services.provider_for(connection_id)?;
    let local = services.model_options(connection_id, &model_id);
    let cancel = chat.begin(ChatSurface::Workspace);

    let result = crate::tools::agent::run(crate::tools::agent::AgentRun {
        provider: provider.as_ref(),
        model: model_id,
        messages,
        root,
        approvals: &approvals,
        out: on_event.clone(),
        cancel,
        command_timeout: crate::tools::COMMAND_TIMEOUT,
        local,
    })
    .await;

    match result {
        Ok(usage) => {
            let _ = on_event.send(ChatEvent::Done(usage));
            Ok(())
        }
        Err(err) => {
            let _ = on_event.send(ChatEvent::Error(err));
            Ok(())
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn begin_on_one_surface_keeps_the_other() {
        let s = ChatState::default();
        let chat1 = s.begin(ChatSurface::Chat);
        let ws1 = s.begin(ChatSurface::Workspace);
        assert!(!chat1.is_cancelled());
        assert!(!ws1.is_cancelled());

        let chat2 = s.begin(ChatSurface::Chat);
        assert!(chat1.is_cancelled());
        assert!(!chat2.is_cancelled());
        assert!(!ws1.is_cancelled());

        s.stop(ChatSurface::Workspace);
        assert!(ws1.is_cancelled());
        assert!(!chat2.is_cancelled());
    }
}
