use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

pub mod files;
pub mod paths;
pub mod recent;
pub mod search;
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
        *self.root.lock().unwrap_or_else(PoisonError::into_inner) = Some(path);
    }

    pub fn clear(&self) {
        *self.root.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }

    pub fn root(&self) -> Result<PathBuf, WorkspaceError> {
        self.root
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .ok_or(WorkspaceError::NoFolder)
    }
}

/// The folder path as the user knows it: no `\\?\` prefix, and `\\server\share` for network folders.
pub fn display_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    match s.strip_prefix(r"\\?\UNC\") {
        Some(rest) => format!(r"\\{rest}"),
        None => s.strip_prefix(r"\\?\").unwrap_or(&s).to_string(),
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

    let info = WorkspaceInfo {
        name,
        path: display_path(&canonical),
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
    AlreadyExists,
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

    #[test]
    fn workspace_state_survives_a_poisoned_lock() {
        let state = std::sync::Arc::new(WorkspaceState::default());
        let s = state.clone();
        let _ = std::thread::spawn(move || {
            let _guard = s.root.lock();
            panic!("poison the lock");
        })
        .join();

        state.set(PathBuf::from("ws"));
        assert_eq!(state.root(), Ok(PathBuf::from("ws")));
        state.clear();
        assert_eq!(state.root(), Err(WorkspaceError::NoFolder));
    }

    #[test]
    fn display_path_strips_verbatim_prefixes() {
        assert_eq!(display_path(Path::new(r"\\?\C:\work\app")), r"C:\work\app");
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\app")),
            r"\\server\share\app"
        );
        assert_eq!(display_path(Path::new("/home/u/app")), "/home/u/app");
    }
}
