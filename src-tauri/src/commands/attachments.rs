use crate::attachments::{self, Attachment, AttachmentStore, Attachments};
use crate::connections::AppError;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Where files dropped on the window are reported, once the UI asks.
#[derive(Default)]
pub struct DropWatch {
    channel: Mutex<Option<Channel<Attachments>>>,
}

impl DropWatch {
    pub fn send(&self, dropped: Attachments) {
        let guard = self.channel.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(channel) = guard.as_ref() {
            let _ = channel.send(dropped);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn watch_drops(state: State<'_, DropWatch>, on_drop: Channel<Attachments>) {
    *state.channel.lock().unwrap_or_else(|e| e.into_inner()) = Some(on_drop);
}

/// Opens the file dialog in Rust and adds what the user picks.
#[tauri::command]
#[specta::specta]
pub async fn pick_attachments(
    app: AppHandle,
    store: State<'_, AttachmentStore>,
) -> Result<Attachments, AppError> {
    let picked =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_files())
            .await
            .map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
    let paths = picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .collect();
    Ok(attachments::add_paths(&store, paths).await)
}

/// Adds pasted data, sent as base64 so it crosses IPC as one string.
#[tauri::command]
#[specta::specta]
pub async fn attach_bytes(
    store: State<'_, AttachmentStore>,
    name: String,
    data_base64: String,
) -> Result<Attachment, AppError> {
    let bytes = BASE64
        .decode(data_base64)
        .map_err(|_| AppError::InvalidInput {
            message: format!("{name} couldn't be read"),
        })?;
    attachments::add(&store, &name, &bytes).await
}

/// An attachment's bytes as base64, for its thumbnail.
#[tauri::command]
#[specta::specta]
pub fn read_attachment(store: State<'_, AttachmentStore>, id: String) -> Result<String, AppError> {
    Ok(BASE64.encode(store.read(&id)?))
}
