use crate::connections::{AppError, Services};
use crate::history::{Conversation, NewMessage, StoredMessage};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn list_conversations(
    services: State<'_, Services>,
    workspace_path: Option<String>,
) -> Result<Vec<Conversation>, AppError> {
    services.conversations(workspace_path)
}

#[tauri::command]
#[specta::specta]
pub fn create_conversation(
    services: State<'_, Services>,
    first_text: String,
    workspace_path: Option<String>,
) -> Result<Conversation, AppError> {
    services.create_conversation(&first_text, workspace_path)
}

#[tauri::command]
#[specta::specta]
pub fn delete_conversation(services: State<'_, Services>, id: u32) -> Result<(), AppError> {
    services.delete_conversation(id)
}

#[tauri::command]
#[specta::specta]
pub fn set_conversation_pinned(
    services: State<'_, Services>,
    id: u32,
    pinned: bool,
) -> Result<(), AppError> {
    services.set_conversation_pinned(id, pinned)
}

#[tauri::command]
#[specta::specta]
pub fn set_conversation_archived(
    services: State<'_, Services>,
    id: u32,
    archived: bool,
) -> Result<(), AppError> {
    services.set_conversation_archived(id, archived)
}

#[tauri::command]
#[specta::specta]
pub fn load_messages(
    services: State<'_, Services>,
    conversation_id: u32,
) -> Result<Vec<StoredMessage>, AppError> {
    services.messages(conversation_id)
}

#[tauri::command]
#[specta::specta]
pub fn append_message(
    services: State<'_, Services>,
    conversation_id: u32,
    message: NewMessage,
) -> Result<u32, AppError> {
    services.append_message(conversation_id, message)
}
