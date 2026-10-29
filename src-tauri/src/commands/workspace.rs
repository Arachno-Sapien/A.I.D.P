use crate::connections::Services;
use crate::workspace::files::{DirEntry, FileContent, WriteFile};
use crate::workspace::recent;
use crate::workspace::{WorkspaceError, WorkspaceInfo, WorkspaceState};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
#[specta::specta]
pub async fn open_folder(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    services: State<'_, Services>,
) -> Result<Option<WorkspaceInfo>, WorkspaceError> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let path: PathBuf = match picked {
        Some(p) => match p.into_path() {
            Ok(path) => path,
            Err(_) => return Err(WorkspaceError::NotFound),
        },
        None => return Ok(None),
    };

    let (canonical, info) = crate::workspace::open(&path)?;
    state.set(canonical);

    let recent_json = services
        .setting(recent::KEY)
        .map_err(|e| WorkspaceError::Storage {
            message: format!("{e:?}"),
        })?
        .unwrap_or_default();
    let list: Vec<String> = serde_json::from_str(&recent_json).unwrap_or_default();
    let updated = recent::push(list, info.path.clone());
    let new_json = serde_json::to_string(&updated).map_err(|e| WorkspaceError::Storage {
        message: e.to_string(),
    })?;
    services
        .set_setting(recent::KEY, &new_json)
        .map_err(|e| WorkspaceError::Storage {
            message: format!("{e:?}"),
        })?;

    Ok(Some(info))
}

#[tauri::command]
#[specta::specta]
pub fn recent_folders(services: State<'_, Services>) -> Result<Vec<String>, WorkspaceError> {
    let json = services
        .setting(recent::KEY)
        .map_err(|e| WorkspaceError::Storage {
            message: format!("{e:?}"),
        })?
        .unwrap_or_default();
    let list: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
    Ok(list)
}

#[tauri::command]
#[specta::specta]
pub fn open_recent(
    path: String,
    state: State<'_, WorkspaceState>,
    services: State<'_, Services>,
) -> Result<WorkspaceInfo, WorkspaceError> {
    let json = services
        .setting(recent::KEY)
        .map_err(|e| WorkspaceError::Storage {
            message: format!("{e:?}"),
        })?
        .unwrap_or_default();
    let list: Vec<String> = serde_json::from_str(&json).unwrap_or_default();

    if !list.contains(&path) {
        return Err(WorkspaceError::NotFound);
    }

    match crate::workspace::open(Path::new(&path)) {
        Ok((canonical, info)) => {
            state.set(canonical);
            let updated = recent::push(list, info.path.clone());
            if let Ok(new_json) = serde_json::to_string(&updated) {
                let _ = services.set_setting(recent::KEY, &new_json);
            }
            Ok(info)
        }
        Err(_) => {
            let mut updated = list;
            updated.retain(|p| p != &path);
            if let Ok(new_json) = serde_json::to_string(&updated) {
                let _ = services.set_setting(recent::KEY, &new_json);
            }
            Err(WorkspaceError::NotFound)
        }
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
        .map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?
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
        .map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?
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
        .map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?
}
