use crate::connections::{AppError, Services};
use crate::mcp::hub::Hub;
use crate::mcp::{split_name, ServerConfig};
use tauri::State;
use tokio_util::sync::CancellationToken;

#[tauri::command]
#[specta::specta]
pub fn list_mcp_servers(services: State<'_, Services>) -> Result<Vec<ServerConfig>, AppError> {
    services.mcp_servers()
}

#[tauri::command]
#[specta::specta]
pub fn add_mcp_server(
    services: State<'_, Services>,
    name: String,
    command: String,
) -> Result<ServerConfig, AppError> {
    services.add_mcp_server(&name, &command)
}

#[tauri::command]
#[specta::specta]
pub async fn set_mcp_server_enabled(
    services: State<'_, Services>,
    hub: State<'_, Hub>,
    id: u32,
    enabled: bool,
) -> Result<(), AppError> {
    services.set_mcp_server_enabled(id, enabled)?;
    if !enabled {
        hub.stop(id).await;
    }
    Ok(())
}

/// Read when an agent run starts, so a change applies from the next task.
#[tauri::command]
#[specta::specta]
pub fn set_mcp_server_auto_approve(
    services: State<'_, Services>,
    id: u32,
    on: bool,
) -> Result<(), AppError> {
    services.set_mcp_server_auto_approve(id, on)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_mcp_server(
    services: State<'_, Services>,
    hub: State<'_, Hub>,
    id: u32,
) -> Result<(), AppError> {
    hub.stop(id).await;
    services.delete_mcp_server(id)
}

#[tauri::command]
#[specta::specta]
pub async fn test_mcp_server(
    services: State<'_, Services>,
    hub: State<'_, Hub>,
    id: u32,
) -> Result<Vec<String>, AppError> {
    let config = services
        .mcp_servers()?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or(AppError::NotFound)?;
    let cancel = CancellationToken::new();
    hub.start(&config, &cancel)
        .await
        .map_err(|e| AppError::InvalidInput {
            message: e.to_string(),
        })?;
    let specs = hub.specs(&[id]).await;
    Ok(specs
        .into_iter()
        .filter_map(|s| split_name(&s.name).map(|(_, tool)| tool.to_string()))
        .collect())
}

