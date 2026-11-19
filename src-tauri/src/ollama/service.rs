//! Ollama status and start-up, built on Services. Commands only call these.

use super::{process, OllamaStatus};
use crate::connections::{AppError, Services};
use std::time::Duration;

/// Ollama answered: make sure its connection exists, refresh its models, report it.
async fn running(services: &Services, version: String) -> OllamaStatus {
    let _ = services.ensure_ollama_connection();
    let _ = services.sync_local_models().await;
    OllamaStatus::Running { version }
}

pub async fn status(services: &Services) -> OllamaStatus {
    match services.ollama().version().await {
        Ok(version) => running(services, version).await,
        Err(_) if process::find_binary().is_some() => OllamaStatus::Stopped,
        Err(_) => OllamaStatus::NotInstalled,
    }
}

/// Starts `ollama serve` if Ollama isn't answering, then waits up to ~15 s for it.
pub async fn ensure_running(services: &Services) -> Result<OllamaStatus, AppError> {
    let ollama = services.ollama();
    if let Ok(version) = ollama.version().await {
        return Ok(running(services, version).await);
    }

    let Some(bin) = process::find_binary() else {
        return Err(AppError::Ollama {
            message: "Ollama isn't installed.".to_string(),
        });
    };

    process::start_serve(&bin).map_err(|e| AppError::Ollama {
        message: e.to_string(),
    })?;

    for _ in 0..30 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Ok(version) = ollama.version().await {
            return Ok(running(services, version).await);
        }
    }

    Err(AppError::Ollama {
        message: "Ollama didn't start. Try starting it from the Start menu.".to_string(),
    })
}
