use crate::tools::OUTPUT_LIMIT;
use crate::workspace::WorkspaceError;
use std::path::Path;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq)]
pub struct CommandResult {
    pub exit_code: Option<i32>,
    pub output: String,
    pub timed_out: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CommandEnd {
    Finished(CommandResult),
    Stopped,
}

pub fn tail(text: &str, max_chars: usize) -> String {
    let total = text.chars().count();
    if total <= max_chars {
        return text.to_string();
    }
    let skip = total - max_chars;
    let byte_idx = text
        .char_indices()
        .nth(skip)
        .map(|(idx, _)| idx)
        .unwrap_or(0);
    format!("[earlier output cut]\n{}", &text[byte_idx..])
}

async fn read_capped<R: tokio::io::AsyncRead + Unpin>(mut reader: R) -> Vec<u8> {
    let mut buf = [0u8; 8192];
    let mut out = Vec::new();
    const MAX_CAPTURE: usize = 64 * 1024;
    while let Ok(n) = reader.read(&mut buf).await {
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        if out.len() > MAX_CAPTURE {
            let excess = out.len() - MAX_CAPTURE;
            out.drain(..excess);
        }
    }
    out
}

fn kill_tree(child: &tokio::process::Child) {
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut tk = std::process::Command::new("taskkill");
            tk.args(["/T", "/F", "/PID", &pid.to_string()]);
            tk.creation_flags(0x0800_0000);
            let _ = tk.status();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-KILL", &format!("-{}", pid)])
                .status();
        }
    }
}

pub async fn run_command(
    root: &Path,
    command: &str,
    timeout: Duration,
    cancel: &CancellationToken,
) -> Result<CommandEnd, WorkspaceError> {
    if !root.exists() || !root.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let mut std_cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("cmd.exe");
        c.args(["/D", "/S", "/C"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.raw_arg(format!("\"{command}\""));
            c.creation_flags(0x0800_0000);
        }
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", command]);
        #[cfg(not(windows))]
        {
            use std::os::unix::process::CommandExt;
            c.process_group(0);
        }
        c
    };

    std_cmd.current_dir(root);
    std_cmd.stdin(std::process::Stdio::null());
    std_cmd.stdout(std::process::Stdio::piped());
    std_cmd.stderr(std::process::Stdio::piped());

    let mut child = tokio::process::Command::from(std_cmd);
    child.kill_on_drop(true);

    let mut spawned = child.spawn().map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let stdout = spawned.stdout.take();
    let stderr = spawned.stderr.take();

    let stdout_task = tokio::spawn(async move {
        if let Some(reader) = stdout {
            read_capped(reader).await
        } else {
            Vec::new()
        }
    });

    let stderr_task = tokio::spawn(async move {
        if let Some(reader) = stderr {
            read_capped(reader).await
        } else {
            Vec::new()
        }
    });

    tokio::select! {
        _ = cancel.cancelled() => {
            kill_tree(&spawned);
            let _ = spawned.wait().await;
            let _ = stdout_task.await;
            let _ = stderr_task.await;
            Ok(CommandEnd::Stopped)
        }
        _ = tokio::time::sleep(timeout) => {
            kill_tree(&spawned);
            let _ = spawned.wait().await;
            let stdout_bytes = stdout_task.await.unwrap_or_default();
            let stderr_bytes = stderr_task.await.unwrap_or_default();
            let stdout_str = String::from_utf8_lossy(&stdout_bytes);
            let stderr_str = String::from_utf8_lossy(&stderr_bytes);
            let mut combined = stdout_str.into_owned();
            if !stderr_str.is_empty() {
                combined.push_str("\n--- stderr ---\n");
                combined.push_str(&stderr_str);
            }
            let output = tail(&combined, OUTPUT_LIMIT);
            Ok(CommandEnd::Finished(CommandResult {
                exit_code: None,
                output,
                timed_out: true,
            }))
        }
        status_res = spawned.wait() => {
            let status = status_res.map_err(|e| WorkspaceError::Io {
                message: e.to_string(),
            })?;
            let stdout_bytes = stdout_task.await.unwrap_or_default();
            let stderr_bytes = stderr_task.await.unwrap_or_default();
            let stdout_str = String::from_utf8_lossy(&stdout_bytes);
            let stderr_str = String::from_utf8_lossy(&stderr_bytes);
            let mut combined = stdout_str.into_owned();
            if !stderr_str.is_empty() {
                combined.push_str("\n--- stderr ---\n");
                combined.push_str(&stderr_str);
            }
            let output = tail(&combined, OUTPUT_LIMIT);
            Ok(CommandEnd::Finished(CommandResult {
                exit_code: status.code(),
                output,
                timed_out: false,
            }))
        }
    }
}

