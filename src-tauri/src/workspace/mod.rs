use serde::{Deserialize, Serialize};

pub mod paths;
pub mod secret_files;

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

