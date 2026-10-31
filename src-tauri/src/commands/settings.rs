use crate::connections::{AppError, AppSettings, KeepAlive, Services, Theme};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn get_settings(services: State<'_, Services>) -> Result<AppSettings, AppError> {
    services.get_settings()
}

#[tauri::command]
#[specta::specta]
pub fn set_theme(services: State<'_, Services>, theme: Theme) -> Result<(), AppError> {
    services.set_theme(theme)
}

#[tauri::command]
#[specta::specta]
pub fn set_keep_alive(
    services: State<'_, Services>,
    keep_alive: KeepAlive,
) -> Result<(), AppError> {
    services.set_keep_alive(keep_alive)
}

#[tauri::command]
#[specta::specta]
pub fn set_check_updates(services: State<'_, Services>, enabled: bool) -> Result<(), AppError> {
    services.set_check_updates(enabled)
}

