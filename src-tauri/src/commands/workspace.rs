use crate::connections::{AppError, Services};
use crate::workspace::files::{DirEntry, FileContent, WriteFile};
use crate::workspace::recent;
use crate::workspace::{WorkspaceError, WorkspaceInfo, WorkspaceState};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

fn io(e: impl std::fmt::Display) -> WorkspaceError {
    WorkspaceError::Io {
        message: e.to_string(),
    }
}

fn storage(e: AppError) -> WorkspaceError {
    match e {
        AppError::Storage { message } => WorkspaceError::Storage { message },
        other => WorkspaceError::Storage {
            message: format!("{other:?}"),
        },
    }
}

fn load_recent(services: &Services) -> Result<Vec<String>, WorkspaceError> {
    let json = services
        .setting(recent::KEY)
        .map_err(storage)?
        .unwrap_or_default();
    Ok(serde_json::from_str(&json).unwrap_or_default())
}

// Recents are a convenience: failing to save them never fails an open.
fn save_recent(services: &Services, list: &[String]) {
    if let Ok(json) = serde_json::to_string(list) {
        let _ = services.set_setting(recent::KEY, &json);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn open_folder(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    services: State<'_, Services>,
) -> Result<Option<WorkspaceInfo>, WorkspaceError> {
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(|_| WorkspaceError::NotFound)?;
        crate::workspace::open(&path).map(Some)
    })
    .await
    .map_err(io)??;

    let Some((canonical, info)) = opened else {
        return Ok(None);
    };
    state.set(canonical);
    if let Ok(list) = load_recent(&services) {
        save_recent(&services, &recent::push(list, info.path.clone()));
    }
    Ok(Some(info))
}

#[tauri::command]
#[specta::specta]
pub fn recent_folders(services: State<'_, Services>) -> Result<Vec<String>, WorkspaceError> {
    load_recent(&services)
}

#[tauri::command]
#[specta::specta]
pub async fn open_recent(
    path: String,
    state: State<'_, WorkspaceState>,
    services: State<'_, Services>,
) -> Result<WorkspaceInfo, WorkspaceError> {
    let list = load_recent(&services)?;
    if !list.contains(&path) {
        return Err(WorkspaceError::NotFound);
    }

    let target = path.clone();
    let opened =
        tauri::async_runtime::spawn_blocking(move || crate::workspace::open(Path::new(&target)))
            .await
            .map_err(io)?;

    match opened {
        Ok((canonical, info)) => {
            state.set(canonical);
            save_recent(&services, &recent::push(list, info.path.clone()));
            Ok(info)
        }
        // Only a folder that is gone leaves the list; an offline drive may come back.
        Err(WorkspaceError::NotFound) => {
            let mut updated = list;
            updated.retain(|p| p != &path);
            save_recent(&services, &updated);
            Err(WorkspaceError::NotFound)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
#[specta::specta]
pub fn close_folder(state: State<'_, WorkspaceState>) -> Result<(), WorkspaceError> {
    state.clear();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_dir(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DirEntry>, WorkspaceError> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || crate::workspace::files::list_dir(&root, &path))
        .await
        .map_err(io)?
}

#[tauri::command]
#[specta::specta]
pub async fn read_file(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<FileContent, WorkspaceError> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || crate::workspace::files::read_file(&root, &path))
        .await
        .map_err(io)?
}

#[tauri::command]
#[specta::specta]
pub async fn write_file(
    req: WriteFile,
    state: State<'_, WorkspaceState>,
) -> Result<String, WorkspaceError> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || crate::workspace::files::write_file(&root, req))
        .await
        .map_err(io)?
}
