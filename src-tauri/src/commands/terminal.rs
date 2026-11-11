use crate::tools::pty::{default_shell, Terminal, TerminalEvent, TerminalState};
use crate::workspace::{WorkspaceError, WorkspaceState};
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    workspace: State<'_, WorkspaceState>,
    terminal: State<'_, TerminalState>,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(), WorkspaceError> {
    let root = workspace.root()?;
    let shell = default_shell();
    let term = Terminal::start(&root, shell, cols, rows, on_event)?;

    let mut lock = terminal
        .term
        .lock()
        .map_err(|_| WorkspaceError::Storage {
            message: "poisoned terminal lock".into(),
        })?;
    *lock = Some(term);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_write(
    terminal: State<'_, TerminalState>,
    data: String,
) -> Result<(), WorkspaceError> {
    let mut lock = terminal
        .term
        .lock()
        .map_err(|_| WorkspaceError::Storage {
            message: "poisoned terminal lock".into(),
        })?;
    if let Some(term) = lock.as_mut() {
        let _ = term.write(&data);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_resize(
    terminal: State<'_, TerminalState>,
    cols: u16,
    rows: u16,
) -> Result<(), WorkspaceError> {
    let lock = terminal
        .term
        .lock()
        .map_err(|_| WorkspaceError::Storage {
            message: "poisoned terminal lock".into(),
        })?;
    if let Some(term) = lock.as_ref() {
        let _ = term.resize(cols, rows);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_close(
    terminal: State<'_, TerminalState>,
) -> Result<(), WorkspaceError> {
    let mut lock = terminal
        .term
        .lock()
        .map_err(|_| WorkspaceError::Storage {
            message: "poisoned terminal lock".into(),
        })?;
    *lock = None;
    Ok(())
}


/// The servers the agent started (decision 0030), for the terminal tabs.
#[tauri::command]
#[specta::specta]
pub fn server_list(
    servers: State<'_, crate::tools::servers::Servers>,
) -> Vec<crate::tools::servers::ServerInfo> {
    servers.list()
}

/// Shows a server in a tab: its kept output, then what it prints next.
#[tauri::command]
#[specta::specta]
pub fn server_attach(
    servers: State<'_, crate::tools::servers::Servers>,
    id: u32,
    on_event: Channel<TerminalEvent>,
) -> bool {
    servers.attach(id, on_event)
}

/// Stops a server and closes its tab.
#[tauri::command]
#[specta::specta]
pub fn server_stop(servers: State<'_, crate::tools::servers::Servers>, id: u32) -> bool {
    servers.stop(id)
}
