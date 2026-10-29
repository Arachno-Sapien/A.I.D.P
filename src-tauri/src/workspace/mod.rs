use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub mod files;
pub mod paths;
pub mod recent;
pub mod secret_files;

pub fn is_git(root: &Path) -> bool {
    root.ancestors().any(|p| p.join(".git").exists())
}

#[derive(Serialize, Deserialize, specta::Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub is_git: bool,
}

#[derive(Default)]
pub struct WorkspaceState {
    root: Mutex<Option<PathBuf>>,
}

impl WorkspaceState {
    pub fn set(&self, path: PathBuf) {
        if let Ok(mut lock) = self.root.lock() {
            *lock = Some(path);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut lock) = self.root.lock() {
            *lock = None;
        }
    }

    pub fn root(&self) -> Result<PathBuf, WorkspaceError> {
        let lock = self.root.lock().map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?;
        lock.clone().ok_or(WorkspaceError::NoFolder)
    }
}

pub fn open(path: &Path) -> Result<(PathBuf, WorkspaceInfo), WorkspaceError> {
    let canonical = std::fs::canonicalize(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => WorkspaceError::NotFound,
        _ => WorkspaceError::Io {
            message: e.to_string(),
        },
    })?;

    if !canonical.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let is_git = is_git(&canonical);
    let name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let path_str = canonical.to_string_lossy();
    let display_path = path_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&path_str)
        .to_string();

    let info = WorkspaceInfo {
        name,
        path: display_path,
        is_git,
    };

    Ok((canonical, info))
}

#[derive(Serialize, Deserialize, specta::Type, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WorkspaceError {
    NoFolder,
    OutsideFolder,
    NotFound,
    NotText,
    TooLarge { bytes: u32 },
    ChangedOnDisk,
    Io { message: String },
    Storage { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_state_without_folder_is_no_folder() {
        assert_eq!(
            WorkspaceState::default().root(),
            Err(WorkspaceError::NoFolder)
        );
    }
}


