use crate::connections::{AppError, Services};
use crate::ollama::{LocalModelView, OllamaStatus, PullEvent};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct OllamaState {
    pub pull_cancel: Mutex<Option<CancellationToken>>,
}

impl OllamaState {
    pub fn begin_pull(&self) -> Result<CancellationToken, AppError> {
        let mut guard = self.pull_cancel.lock().unwrap_or_else(PoisonError::into_inner);
        if guard.is_some() {
            return Err(AppError::InvalidInput {
                message: "A download is already running.".to_string(),
            });
        }
        let token = CancellationToken::new();
        *guard = Some(token.clone());
        Ok(token)
    }

    pub fn finish_pull(&self) {
        let mut guard = self.pull_cancel.lock().unwrap_or_else(PoisonError::into_inner);
        *guard = None;
    }

    pub fn cancel_pull(&self) {
        let mut guard = self.pull_cancel.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(token) = guard.take() {
            token.cancel();
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_status(services: State<'_, Services>) -> Result<OllamaStatus, AppError> {
    let ollama = services.ollama();
    match ollama.version().await {
        Ok(version) => {
            let _ = services.ensure_ollama_connection();
            let _ = services.sync_local_models().await;
            Ok(OllamaStatus::Running { version })
        }
        Err(_) => {
            if crate::ollama::process::find_binary().is_some() {
                Ok(OllamaStatus::Stopped)
            } else {
                Ok(OllamaStatus::NotInstalled)
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_start(services: State<'_, Services>) -> Result<OllamaStatus, AppError> {
    let ollama = services.ollama();
    if let Ok(version) = ollama.version().await {
        let _ = services.ensure_ollama_connection();
        let _ = services.sync_local_models().await;
        return Ok(OllamaStatus::Running { version });
    }

    let bin = match crate::ollama::process::find_binary() {
        Some(b) => b,
        None => {
            return Err(AppError::Ollama {
                message: "Ollama isn't installed.".to_string(),
            });
        }
    };

    crate::ollama::process::start_serve(&bin).map_err(|e| AppError::Ollama {
        message: e.to_string(),
    })?;

    for _ in 0..30 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Ok(version) = ollama.version().await {
            let _ = services.ensure_ollama_connection();
            let _ = services.sync_local_models().await;
            return Ok(OllamaStatus::Running { version });
        }
    }

    Err(AppError::Ollama {
        message: "Ollama didn't start. Try starting it from the Start menu.".to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn ollama_open_download() -> Result<(), AppError> {
    crate::ollama::process::open_download_page().map_err(|e| AppError::Ollama {
        message: e.to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_models(services: State<'_, Services>) -> Result<Vec<LocalModelView>, AppError> {
    services.local_models().await
}

pub async fn ollama_pull_impl(
    services: &Services,
    state: &OllamaState,
    name: String,
    on_event: Channel<PullEvent>,
) -> Result<(), AppError> {
    if !crate::ollama::valid_model_name(&name) {
        return Err(AppError::InvalidInput {
            message: "Invalid model name.".to_string(),
        });
    }

    let cancel = state.begin_pull()?;
    let ollama = services.ollama();
    let res = ollama.pull(&name, on_event, &cancel).await;
    state.finish_pull();

    match res {
        Ok(()) => {
            let _ = services.sync_local_models().await;
            Ok(())
        }
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_pull(
    services: State<'_, Services>,
    state: State<'_, OllamaState>,
    name: String,
    on_event: Channel<PullEvent>,
) -> Result<(), AppError> {
    ollama_pull_impl(&services, &state, name, on_event).await
}

#[tauri::command]
#[specta::specta]
pub fn ollama_cancel_pull(state: State<'_, OllamaState>) {
    state.cancel_pull();
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_delete(services: State<'_, Services>, name: String) -> Result<(), AppError> {
    let ollama = services.ollama();
    ollama.delete(&name).await?;
    let _ = services.sync_local_models().await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn ollama_unload(services: State<'_, Services>, name: String) -> Result<(), AppError> {
    let ollama = services.ollama();
    ollama.unload(&name).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_model_context(
    services: State<'_, Services>,
    model_id: String,
    num_ctx: u32,
) -> Result<(), AppError> {
    services.set_model_context(&model_id, num_ctx)
}
