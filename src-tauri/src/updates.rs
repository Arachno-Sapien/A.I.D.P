//! Signed updates from GitHub Releases. The updater plugin runs behind the
//! app's own commands (`commands/updates.rs`); the UI never calls the plugin.

use crate::close_guard::CloseGuard;
use crate::connections::AppError;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum UpdateEvent {
    /// Kilobytes so far and in all (0 when the server does not say).
    Progress {
        #[serde(rename = "downloadedKb")]
        downloaded_kb: u32,
        #[serde(rename = "totalKb")]
        total_kb: u32,
    },
    /// The download is done and verified; the installer runs next.
    Installing,
}

/// The update the last check found, kept for `install_update`.
#[derive(Default)]
pub struct UpdateState(pub tokio::sync::Mutex<Option<tauri_plugin_updater::Update>>);

/// An update installs and restarts the app, so unsaved editor changes would be lost.
pub fn may_install(guard: &CloseGuard) -> Result<(), AppError> {
    if guard.has_unsaved() {
        return Err(AppError::InvalidInput {
            message: "Save or close your unsaved files first.".to_string(),
        });
    }
    Ok(())
}

/// Bytes as whole kilobytes for the IPC, which takes no 64-bit integers.
pub fn kilobytes(bytes: u64) -> u32 {
    u32::try_from(bytes / 1024).unwrap_or(u32::MAX)
}

/// Whether `package.json` and `tauri.conf.json` hold the same version as
/// `Cargo.toml`; the release tag is made from it.
pub fn versions_match(cargo: &str, package_json: &str, tauri_conf: &str) -> bool {
    let version = |text: &str| {
        serde_json::from_str::<serde_json::Value>(text)
            .ok()?
            .get("version")?
            .as_str()
            .map(str::to_owned)
    };
    version(package_json).as_deref() == Some(cargo) && version(tauri_conf).as_deref() == Some(cargo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_refused_with_unsaved_files() {
        let guard = CloseGuard::default();
        guard.set_unsaved(true);
        assert_eq!(
            may_install(&guard),
            Err(AppError::InvalidInput {
                message: "Save or close your unsaved files first.".to_string()
            })
        );
        guard.set_unsaved(false);
        assert_eq!(may_install(&guard), Ok(()));
    }

    #[test]
    fn versions_match_table() {
        let pkg = r#"{"name":"aidp","version":"0.1.0-rc.1"}"#;
        let conf = r#"{"productName":"A.I.D.P","version":"0.1.0-rc.1"}"#;
        assert!(versions_match("0.1.0-rc.1", pkg, conf));
        assert!(!versions_match("0.1.0", pkg, conf));
        assert!(!versions_match("0.1.0-rc.1", r#"{"version":"0.1.0"}"#, conf));
        assert!(!versions_match("0.1.0-rc.1", pkg, r#"{"version":"0.1.1"}"#));
        assert!(!versions_match("0.1.0-rc.1", "not json", conf));
        assert!(!versions_match("0.1.0-rc.1", r#"{"name":"aidp"}"#, conf));
    }
}
