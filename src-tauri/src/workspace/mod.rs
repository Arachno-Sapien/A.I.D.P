use serde::{Deserialize, Serialize};
use std::path::Path;

pub mod files;
pub mod paths;
pub mod secret_files;

pub fn is_git(root: &Path) -> bool {
    root.ancestors().any(|p| p.join(".git").exists())
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

