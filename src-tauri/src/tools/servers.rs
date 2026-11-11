//! Commands the agent starts that keep running, such as a dev server (decision 0030).

use super::command::shell_command;
#[cfg(windows)]
use super::command::Job;
use super::pty::{take_utf8, TerminalEvent};
use crate::workspace::WorkspaceError;
use serde::Serialize;
use specta::Type;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tokio::io::{AsyncRead, AsyncReadExt};

/// How much of a server's output is kept: the end of it.
pub const SERVER_KEEP: usize = 64 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub struct ServerStatus {
    pub output: String,
    pub exit_code: Option<i32>,
    pub running: bool,
}

#[derive(Serialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub id: u32,
    pub command: String,
    pub running: bool,
}

struct Shared {
    status: ServerStatus,
    /// The terminal tab showing this server, if one is open.
    out: Option<Channel<TerminalEvent>>,
}

type SharedRef = Arc<Mutex<Shared>>;

fn lock(shared: &SharedRef) -> std::sync::MutexGuard<'_, Shared> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}

fn push_output(shared: &SharedRef, text: String) {
    let mut s = lock(shared);
    s.status.output.push_str(&text);
    let len = s.status.output.len();
    if len > SERVER_KEEP {
        let mut cut = len - SERVER_KEEP;
        while !s.status.output.is_char_boundary(cut) {
            cut += 1;
        }
        s.status.output.drain(..cut);
    }
    if let Some(out) = &s.out {
        let _ = out.send(TerminalEvent::Output(text));
    }
}

async fn pump<R: AsyncRead + Unpin>(mut reader: R, shared: SharedRef) {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    while let Ok(n) = reader.read(&mut chunk).await {
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        let text = take_utf8(&mut buf);
        if !text.is_empty() {
            push_output(&shared, text);
        }
    }
    if !buf.is_empty() {
        push_output(&shared, String::from_utf8_lossy(&buf).into_owned());
    }
}

struct Server {
    command: String,
    pid: Option<u32>,
    shared: SharedRef,
    #[cfg(windows)]
    job: Option<Job>,
}

impl Drop for Server {
    /// Ends every process the server started: closing the job does it on Windows
    /// (with `taskkill /T` when Windows refused the job), the process group elsewhere.
    fn drop(&mut self) {
        let Some(pid) = self.pid else { return };
        #[cfg(windows)]
        if self.job.is_none() {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .creation_flags(0x0800_0000)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-KILL", "--", &format!("-{pid}")])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
}

/// The servers the agent started. Each one runs until it is stopped, the folder
/// changes or the app quits (dropping this ends them all).
pub struct Servers {
    next: AtomicU32,
    list: Mutex<HashMap<u32, Server>>,
}

impl Default for Servers {
    fn default() -> Self {
        Self {
            next: AtomicU32::new(1),
            list: Mutex::new(HashMap::new()),
        }
    }
}

impl Servers {
    fn servers(&self) -> std::sync::MutexGuard<'_, HashMap<u32, Server>> {
        self.list.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts `command` in `root` with no input and no time limit.
    pub async fn start(&self, root: &Path, command: &str) -> Result<u32, WorkspaceError> {
        if !root.is_dir() {
            return Err(WorkspaceError::NotFound);
        }
        let mut std_cmd = shell_command(command);
        std_cmd
            .current_dir(root)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = tokio::process::Command::from(std_cmd)
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| WorkspaceError::Io {
                message: e.to_string(),
            })?;
        let pid = child.id();
        #[cfg(windows)]
        let job = Job::holding(&child);

        let shared: SharedRef = Arc::new(Mutex::new(Shared {
            status: ServerStatus {
                output: String::new(),
                exit_code: None,
                running: true,
            },
            out: None,
        }));
        let readers: Vec<_> = [
            child.stdout.take().map(|r| tokio::spawn(pump(r, shared.clone()))),
            child.stderr.take().map(|r| tokio::spawn(pump(r, shared.clone()))),
        ]
        .into_iter()
        .flatten()
        .collect();
        let waiter_shared = shared.clone();
        tokio::spawn(async move {
            let status = child.wait().await;
            // A process the server left behind may still hold the output open.
            for reader in readers {
                let _ = tokio::time::timeout(std::time::Duration::from_secs(2), reader).await;
            }
            let mut s = lock(&waiter_shared);
            s.status.running = false;
            s.status.exit_code = status.ok().and_then(|st| st.code());
            if let Some(out) = &s.out {
                let _ = out.send(TerminalEvent::Exit);
            }
        });

        let id = self.next.fetch_add(1, Ordering::SeqCst);
        self.servers().insert(
            id,
            Server {
                command: command.to_string(),
                pid,
                shared,
                #[cfg(windows)]
                job,
            },
        );
        Ok(id)
    }

    pub fn output(&self, id: u32) -> Option<ServerStatus> {
        self.servers().get(&id).map(|s| lock(&s.shared).status.clone())
    }

    /// Ends the server and forgets it. False if there is no such server.
    pub fn stop(&self, id: u32) -> bool {
        let server = self.servers().remove(&id);
        server.is_some()
    }

    /// Ends every server, for a folder change or quitting.
    pub fn stop_all(&self) {
        let all: Vec<Server> = self.servers().drain().map(|(_, s)| s).collect();
        drop(all);
    }

    pub fn list(&self) -> Vec<ServerInfo> {
        let mut list: Vec<ServerInfo> = self
            .servers()
            .iter()
            .map(|(id, s)| ServerInfo {
                id: *id,
                command: s.command.clone(),
                running: lock(&s.shared).status.running,
            })
            .collect();
        list.sort_by_key(|s| s.id);
        list
    }

    /// Sends the kept output to `out`, then everything new; replaces an earlier tab.
    pub fn attach(&self, id: u32, out: Channel<TerminalEvent>) -> bool {
        let servers = self.servers();
        let Some(server) = servers.get(&id) else {
            return false;
        };
        let mut s = lock(&server.shared);
        if !s.status.output.is_empty() {
            let _ = out.send(TerminalEvent::Output(s.status.output.clone()));
        }
        if !s.status.running {
            let _ = out.send(TerminalEvent::Exit);
        }
        s.out = Some(out);
        true
    }

    #[cfg(test)]
    fn pid(&self, id: u32) -> Option<u32> {
        self.servers().get(&id).and_then(|s| s.pid)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[cfg(windows)]
    const SLEEPER: &str = "echo ready && ping -n 60 127.0.0.1 >nul";
    #[cfg(not(windows))]
    const SLEEPER: &str = "echo ready; sleep 60";

    fn pid_alive(pid: u32) -> bool {
        #[cfg(windows)]
        {
            let out = std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
        }
        #[cfg(not(windows))]
        {
            std::process::Command::new("kill")
                .args(["-0", &pid.to_string()])
                .status()
                .unwrap()
                .success()
        }
    }

    async fn until(mut check: impl FnMut() -> bool) -> bool {
        for _ in 0..50 {
            if check() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        false
    }

    #[tokio::test]
    async fn server_keeps_running_and_stops() {
        let servers = Servers::default();
        let id = servers.start(&std::env::temp_dir(), SLEEPER).await.unwrap();
        assert_eq!(id, 1);
        assert!(until(|| servers.output(id).is_some_and(|s| s.output.contains("ready"))).await);
        assert!(servers.output(id).unwrap().running);
        assert_eq!(servers.list(), vec![ServerInfo { id, command: SLEEPER.into(), running: true }]);
        let pid = servers.pid(id).unwrap();

        assert!(servers.stop(id));
        assert!(servers.output(id).is_none());
        assert!(until(|| !pid_alive(pid)).await, "the server outlived stop");
        assert!(!servers.stop(id));
    }

    #[tokio::test]
    async fn server_exit_is_reported() {
        let servers = Servers::default();
        let id = servers.start(&std::env::temp_dir(), "exit 3").await.unwrap();
        assert!(until(|| servers.output(id).is_some_and(|s| !s.running)).await);
        assert_eq!(servers.output(id).unwrap().exit_code, Some(3));
    }

    #[tokio::test]
    async fn server_output_keeps_the_tail() {
        let servers = Servers::default();
        #[cfg(windows)]
        let cmd = "for /L %i in (1,1,4000) do @echo line %i of a chatty server";
        #[cfg(not(windows))]
        let cmd = "for i in $(seq 1 4000); do echo line $i of a chatty server; done";
        let id = servers.start(&std::env::temp_dir(), cmd).await.unwrap();
        assert!(until(|| servers.output(id).is_some_and(|s| !s.running)).await);
        let out = servers.output(id).unwrap().output;
        assert!(out.len() <= SERVER_KEEP + 100, "{}", out.len());
        assert!(out.trim_end().ends_with("line 4000 of a chatty server"));
    }

    #[tokio::test]
    async fn dropping_servers_ends_them() {
        let servers = Servers::default();
        let id = servers.start(&std::env::temp_dir(), SLEEPER).await.unwrap();
        assert!(until(|| servers.output(id).is_some_and(|s| s.output.contains("ready"))).await);
        let pid = servers.pid(id).unwrap();
        drop(servers);
        assert!(until(|| !pid_alive(pid)).await, "a server outlived the app");
    }
}
