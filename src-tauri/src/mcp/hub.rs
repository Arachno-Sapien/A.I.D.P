use super::client::{CallResult, Client, RemoteTool};
use super::{
    split_name, to_specs, McpError, ServerConfig, LIST_TIMEOUT, START_TIMEOUT, STDERR_TAIL_BYTES,
};
use crate::gateway::ToolSpec;
use crate::tools::command::{kill_tree, shell_command};
#[cfg(windows)]
use crate::tools::command::Job;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

struct Running {
    name: String,
    command: String,
    client: Arc<Client>,
    tools: Vec<RemoteTool>,
    child: Child,
    pid: Option<u32>,
    #[cfg(windows)]
    job: Option<Job>,
    stderr: Arc<Mutex<Vec<u8>>>,
    stderr_task: JoinHandle<()>,
    last_used: Instant,
}

#[derive(Clone)]
pub struct Hub {
    base: PathBuf,
    running: Arc<AsyncMutex<HashMap<u32, Running>>>,
    /// How many times each server was stopped. A start that began before a stop
    /// (Remove or Off pressed while it starts) must not add the server afterwards.
    stops: Arc<Mutex<HashMap<u32, u64>>>,
}

impl Hub {
    /// `base` is `<app data dir>/mcp`; each server runs in `base/<name>` (created on start).
    pub fn new(base: PathBuf) -> Self {
        Self {
            base,
            running: Arc::new(AsyncMutex::new(HashMap::new())),
            stops: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn stop_count(&self, id: u32) -> u64 {
        let guard = self.stops.lock().unwrap_or_else(PoisonError::into_inner);
        guard.get(&id).copied().unwrap_or(0)
    }

    /// Starts the server unless it already runs with the same command and an open stream
    /// (a different command or a closed stream stops the old one first). Returns the number
    /// of tools it offers after `to_specs` filtering.
    pub async fn start(
        &self,
        config: &ServerConfig,
        cancel: &CancellationToken,
    ) -> Result<usize, McpError> {
        let stops_before = self.stop_count(config.id);
        let existing = {
            let mut guard = self.running.lock().await;
            if let Some(entry) = guard.get_mut(&config.id)
                && entry.command == config.command
                && !entry.client.is_closed()
            {
                entry.last_used = Instant::now();
                return Ok(to_specs(&entry.name, &entry.tools).len());
            }
            guard.remove(&config.id)
        };
        if let Some(old) = existing {
            kill_running(old, false).await;
        }

        if cancel.is_cancelled() {
            return Err(McpError::Stopped);
        }

        let dir = self.base.join(&config.name);
        std::fs::create_dir_all(&dir).map_err(|e| McpError::Start {
            message: e.to_string(),
        })?;

        let mut std_cmd = shell_command(&config.command);
        std_cmd.current_dir(&dir);
        std_cmd.stdin(Stdio::piped());
        std_cmd.stdout(Stdio::piped());
        std_cmd.stderr(Stdio::piped());

        let mut cmd = tokio::process::Command::from(std_cmd);
        cmd.kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| McpError::Start {
            message: e.to_string(),
        })?;
        let pid = child.id();
        #[cfg(windows)]
        let job = Job::holding(&child);

        let Some(stdin) = child.stdin.take() else {
            kill_tree(pid).await;
            let _ = child.start_kill();
            return Err(McpError::Start {
                message: "failed to capture stdin".into(),
            });
        };
        let Some(stdout) = child.stdout.take() else {
            kill_tree(pid).await;
            let _ = child.start_kill();
            return Err(McpError::Start {
                message: "failed to capture stdout".into(),
            });
        };
        let stderr_pipe = child.stderr.take();
        let stderr = Arc::new(Mutex::new(Vec::new()));
        let stderr_ref = Arc::clone(&stderr);
        let stderr_task = tokio::spawn(async move {
            if let Some(mut reader) = stderr_pipe {
                let mut buf = [0u8; 4096];
                while let Ok(n) = reader.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let mut guard = stderr_ref.lock().unwrap_or_else(PoisonError::into_inner);
                    guard.extend_from_slice(&buf[..n]);
                    if guard.len() > STDERR_TAIL_BYTES {
                        let excess = guard.len() - STDERR_TAIL_BYTES;
                        guard.drain(..excess);
                    }
                }
            }
        });

        let client = Client::new(stdout, stdin);
        let mut entry = Running {
            name: config.name.clone(),
            command: config.command.clone(),
            client: Arc::clone(&client),
            tools: Vec::new(),
            child,
            pid,
            #[cfg(windows)]
            job,
            stderr,
            stderr_task,
            last_used: Instant::now(),
        };

        let init = client.initialize(START_TIMEOUT, cancel).await;
        let tools_res = match init {
            Ok(()) => client.list_tools(LIST_TIMEOUT, cancel).await,
            Err(e) => Err(e),
        };

        match tools_res {
            Ok(tools) => {
                let count = to_specs(&config.name, &tools).len();
                entry.tools = tools;
                entry.last_used = Instant::now();
                let mut guard = self.running.lock().await;
                // Checked under the lock `stop` takes after counting, so one of the two sees the other.
                if self.stop_count(config.id) != stops_before {
                    drop(guard);
                    kill_running(entry, false).await;
                    return Err(McpError::Stopped);
                }
                let displaced = guard.insert(config.id, entry);
                drop(guard);
                if let Some(old) = displaced {
                    kill_running(old, false).await;
                }
                Ok(count)
            }
            Err(McpError::Closed { .. }) => {
                let tail = kill_running(entry, true).await;
                Err(McpError::Closed { stderr: tail })
            }
            Err(err) => {
                kill_running(entry, false).await;
                Err(err)
            }
        }
    }

    /// The tools of the running servers among `ids`, in `id` order.
    pub async fn specs(&self, ids: &[u32]) -> Vec<ToolSpec> {
        let guard = self.running.lock().await;
        let mut active: Vec<(u32, &Running)> = guard
            .iter()
            .filter(|(id, r)| ids.contains(id) && !r.client.is_closed())
            .map(|(id, r)| (*id, r))
            .collect();
        active.sort_by_key(|(id, _)| *id);
        active
            .into_iter()
            .flat_map(|(_, r)| to_specs(&r.name, &r.tools))
            .collect()
    }

    /// Calls `mcp__server__tool`. Unknown server or tool: `Protocol { message: "no such tool" }`.
    pub async fn call(
        &self,
        full_name: &str,
        arguments: serde_json::Value,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<CallResult, McpError> {
        let Some((server, tool)) = split_name(full_name) else {
            return Err(McpError::Protocol {
                message: "no such tool".into(),
            });
        };

        let (server_id, client) = {
            let mut guard = self.running.lock().await;
            let Some((&id, entry)) = guard.iter_mut().find(|(_, r)| r.name == server) else {
                return Err(McpError::Protocol {
                    message: "no such tool".into(),
                });
            };
            let allowed = to_specs(&entry.name, &entry.tools)
                .iter()
                .any(|s| s.name == full_name);
            if !allowed {
                return Err(McpError::Protocol {
                    message: "no such tool".into(),
                });
            }
            entry.last_used = Instant::now();
            (id, Arc::clone(&entry.client))
        };

        match client.call_tool(tool, arguments, timeout, cancel).await {
            Ok(result) => Ok(result),
            Err(McpError::Closed { .. }) => {
                let removed = {
                    let mut guard = self.running.lock().await;
                    if guard
                        .get(&server_id)
                        .is_some_and(|e| Arc::ptr_eq(&e.client, &client))
                    {
                        guard.remove(&server_id)
                    } else {
                        None
                    }
                };
                let stderr = match removed {
                    Some(entry) => kill_running(entry, true).await,
                    None => String::new(),
                };
                Err(McpError::Closed { stderr })
            }
            Err(err) => Err(err),
        }
    }

    pub async fn stop(&self, id: u32) {
        {
            let mut stops = self.stops.lock().unwrap_or_else(PoisonError::into_inner);
            *stops.entry(id).or_insert(0) += 1;
        }
        let entry = {
            let mut guard = self.running.lock().await;
            guard.remove(&id)
        };
        if let Some(r) = entry {
            kill_running(r, false).await;
        }
    }

    pub async fn stop_all(&self) {
        let entries: Vec<Running> = {
            let mut guard = self.running.lock().await;
            guard.drain().map(|(_, r)| r).collect()
        };
        // Together, so quitting waits for the slowest server, not for each in turn.
        futures_util::future::join_all(entries.into_iter().map(|e| kill_running(e, false))).await;
    }

    /// Stops servers not used for `older_than`.
    pub async fn stop_idle(&self, older_than: Duration) {
        let now = Instant::now();
        let entries: Vec<Running> = {
            let mut guard = self.running.lock().await;
            let stale: Vec<u32> = guard
                .iter()
                .filter(|(_, r)| {
                    r.client.is_closed() || now.saturating_duration_since(r.last_used) >= older_than
                })
                .map(|(id, _)| *id)
                .collect();
            stale.into_iter().filter_map(|id| guard.remove(&id)).collect()
        };
        for entry in entries {
            kill_running(entry, false).await;
        }
    }

    pub async fn is_running(&self, id: u32) -> bool {
        let guard = self.running.lock().await;
        guard.get(&id).is_some_and(|r| !r.client.is_closed())
    }
}

async fn kill_running(mut entry: Running, collect_stderr: bool) -> String {
    drop(entry.client);
    if collect_stderr {
        let _ = tokio::time::timeout(Duration::from_millis(300), &mut entry.stderr_task).await;
    }
    kill_tree(entry.pid).await;
    #[cfg(windows)]
    drop(entry.job);
    let _ = entry.child.start_kill();
    let _ = tokio::time::timeout(Duration::from_secs(2), entry.child.wait()).await;
    entry.stderr_task.abort();

    if !collect_stderr {
        return String::new();
    }
    format_stderr(&entry.stderr)
}

fn format_stderr(buf: &Mutex<Vec<u8>>) -> String {
    let raw = buf.lock().unwrap_or_else(PoisonError::into_inner);
    let s = String::from_utf8_lossy(&raw);
    let trimmed = s.trim();
    let count = trimmed.chars().count();
    if count <= 500 {
        trimmed.to_string()
    } else {
        trimmed.chars().skip(count - 500).collect()
    }
}
