use crate::tools::approvals::Approvals;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn answer_tool(approvals: State<'_, Approvals>, id: u32, approve: bool) -> bool {
    approvals.answer(id, approve)
}

