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

/// How long the output readers get after a kill to reach the end of the output.
const KILL_GRACE: Duration = Duration::from_secs(2);

async fn kill_tree(pid: Option<u32>) {
    let Some(pid) = pid else { return };
    #[cfg(windows)]
    let mut killer = {
        let mut c = tokio::process::Command::new("taskkill");
        c.args(["/T", "/F", "/PID", &pid.to_string()]);
        c.creation_flags(0x0800_0000);
        c
    };
    #[cfg(not(windows))]
    let mut killer = {
        let mut c = tokio::process::Command::new("kill");
        c.args(["-KILL", "--", &format!("-{pid}")]);
        c
    };
    killer
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let _ = killer.status().await;
}

/// The output a reader has once it ends. A reader still blocked after the grace
/// period (a process outside the killed tree holds the output) is dropped.
async fn collect(mut task: tokio::task::JoinHandle<Vec<u8>>) -> Vec<u8> {
    match tokio::time::timeout(KILL_GRACE, &mut task).await {
        Ok(Ok(bytes)) => bytes,
        _ => {
            task.abort();
            Vec::new()
        }
    }
}

fn finished(exit_code: Option<i32>, stdout: &[u8], stderr: &[u8], timed_out: bool) -> CommandEnd {
    let mut combined = String::from_utf8_lossy(stdout).into_owned();
    let stderr = String::from_utf8_lossy(stderr);
    if !stderr.is_empty() {
        combined.push_str("\n--- stderr ---\n");
        combined.push_str(&stderr);
    }
    CommandEnd::Finished(CommandResult {
        exit_code,
        output: tail(&combined, OUTPUT_LIMIT),
        timed_out,
    })
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

    let pid = spawned.id();
    let stdout = spawned.stdout.take();
    let stderr = spawned.stderr.take();

    let mut stdout_task = tokio::spawn(async move {
        if let Some(reader) = stdout {
            read_capped(reader).await
        } else {
            Vec::new()
        }
    });

    let mut stderr_task = tokio::spawn(async move {
        if let Some(reader) = stderr {
            read_capped(reader).await
        } else {
            Vec::new()
        }
    });

    // The shell can exit while a process it started still holds the output
    // open (`start /b`, `&`), so reading to the end is part of the race too.
    let mut done = Box::pin(async {
        let status = spawned.wait().await;
        let out = (&mut stdout_task).await.unwrap_or_default();
        let err = (&mut stderr_task).await.unwrap_or_default();
        (status, out, err)
    });

    let timed_out = tokio::select! {
        (status, out, err) = &mut done => {
            let status = status.map_err(|e| WorkspaceError::Io {
                message: e.to_string(),
            })?;
            return Ok(finished(status.code(), &out, &err, false));
        }
        _ = tokio::time::sleep(timeout) => true,
        _ = cancel.cancelled() => false,
    };
    drop(done);

    // ponytail: on Windows a process whose parent already exited is outside
    // the tree taskkill sees and keeps running; a job object would catch it.
    kill_tree(pid).await;
    let _ = spawned.start_kill();
    let _ = spawned.wait().await;

    if !timed_out {
        stdout_task.abort();
        stderr_task.abort();
        return Ok(CommandEnd::Stopped);
    }
    let (out, err) = tokio::join!(collect(stdout_task), collect(stderr_task));
    Ok(finished(None, &out, &err, true))
}

