use crate::connections::{
    AddedConnection, AppError, ChatModel, ConnectionView, NewConnection, Services,
};
use crate::gateway::ModelInfo;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn list_connections(services: State<'_, Services>) -> Result<Vec<ConnectionView>, AppError> {
    services.list_connections()
}

#[tauri::command]
#[specta::specta]
pub async fn add_connection(
    services: State<'_, Services>,
    input: NewConnection,
) -> Result<AddedConnection, AppError> {
    services.add_connection(input).await
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(services: State<'_, Services>, id: u32) -> Result<(), AppError> {
    services.test_connection(id).await
}

#[tauri::command]
#[specta::specta]
pub async fn available_models(
    services: State<'_, Services>,
    id: u32,
) -> Result<Vec<ModelInfo>, AppError> {
    services.available_models(id).await
}

#[tauri::command]
#[specta::specta]
pub async fn replace_key(
    services: State<'_, Services>,
    id: u32,
    api_key: String,
) -> Result<ConnectionView, AppError> {
    services.replace_key(id, api_key).await
}

#[tauri::command]
#[specta::specta]
pub fn delete_connection(services: State<'_, Services>, id: u32) -> Result<(), AppError> {
    services.delete_connection(id)
}

#[tauri::command]
#[specta::specta]
pub fn set_models(
    services: State<'_, Services>,
    connection_id: u32,
    models: Vec<ModelInfo>,
) -> Result<(), AppError> {
    services.set_models(connection_id, models)
}

#[tauri::command]
#[specta::specta]
pub fn chat_models(services: State<'_, Services>) -> Result<Vec<ChatModel>, AppError> {
    services.chat_models()
}

#[tauri::command]
#[specta::specta]
pub fn set_default_model(
    services: State<'_, Services>,
    connection_id: u32,
    model_id: String,
) -> Result<(), AppError> {
    services.set_default_model(connection_id, model_id)
}

