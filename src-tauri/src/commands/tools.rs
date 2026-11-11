use crate::tools::approvals::Approvals;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn answer_tool(approvals: State<'_, Approvals>, id: u32, approve: bool) -> bool {
    approvals.answer(id, approve)
}


/// Always allow this exact command in the open folder (decision 0030).
#[tauri::command]
#[specta::specta]
pub fn allow_command(
    workspace: State<'_, crate::workspace::WorkspaceState>,
    services: State<'_, crate::connections::Services>,
    command: String,
) -> Result<(), crate::connections::AppError> {
    let root = workspace
        .root()
        .map_err(|_| crate::connections::AppError::InvalidInput {
            message: "Open a folder first.".to_string(),
        })?;
    services.allow_command(&crate::workspace::display_path(&root), &command)
}

#[tauri::command]
#[specta::specta]
pub fn list_allowed_commands(
    services: State<'_, crate::connections::Services>,
) -> Result<Vec<crate::db::commands::AllowedCommand>, crate::connections::AppError> {
    services.allowed_commands()
}

#[tauri::command]
#[specta::specta]
pub fn remove_allowed_command(
    services: State<'_, crate::connections::Services>,
    folder: String,
    command: String,
) -> Result<(), crate::connections::AppError> {
    services.remove_allowed_command(&folder, &command)
}
