use crate::close_guard::CloseGuard;
use crate::connections::AppError;
use crate::updates::{kilobytes, may_install, UpdateEvent, UpdateInfo, UpdateState};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
#[specta::specta]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
#[specta::specta]
pub async fn check_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, AppError> {
    let failed = |e: tauri_plugin_updater::Error| AppError::Update {
        message: format!("Couldn't check for updates: {e}"),
    };
    let update = app.updater().map_err(failed)?.check().await.map_err(failed)?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    *state.0.lock().await = update;
    Ok(info)
}

/// Downloads, verifies against the public key, installs and restarts. On
/// Windows the installer closes the app itself.
#[tauri::command]
#[specta::specta]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
    guard: State<'_, CloseGuard>,
    out: Channel<UpdateEvent>,
) -> Result<(), AppError> {
    may_install(&guard)?;
    let found = state.0.lock().await;
    let Some(update) = found.as_ref() else {
        return Err(AppError::NotFound);
    };
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = out.send(UpdateEvent::Progress {
                    downloaded_kb: kilobytes(downloaded),
                    total_kb: total.map(kilobytes).unwrap_or(0),
                });
            },
            || {
                let _ = out.send(UpdateEvent::Installing);
            },
        )
        .await
        .map_err(|e| AppError::Update {
            message: format!("The update failed: {e}"),
        })?;
    app.restart();
}
