use crate::workspace::WorkspaceError;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum TerminalEvent {
    Output(String),
    Exit,
}

pub fn take_utf8(buf: &mut Vec<u8>) -> String {
    let mut out = String::new();
    let mut cursor = 0;
    loop {
        match std::str::from_utf8(&buf[cursor..]) {
            Ok(valid) => {
                out.push_str(valid);
                buf.clear();
                break;
            }
            Err(e) => {
                let valid = &buf[cursor..cursor + e.valid_up_to()];
                if let Ok(s) = std::str::from_utf8(valid) {
                    out.push_str(s);
                }
                cursor += e.valid_up_to();
                match e.error_len() {
                    Some(len) => {
                        out.push('\u{FFFD}');
                        cursor += len;
                    }
                    None => {
                        buf.drain(..cursor);
                        return out;
                    }
                }
            }
        }
    }
    out
}

pub fn default_shell() -> CommandBuilder {
    if cfg!(windows) {
        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.arg("-NoLogo");
        cmd
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut cmd = CommandBuilder::new(shell);
        cmd.env("TERM", "xterm-256color");
        cmd
    }
}

pub struct Terminal {
    master: Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>,
    writer: Box<dyn Write + Send>,
    killed: Arc<AtomicBool>,
}

impl Terminal {
    pub fn start(
        root: &Path,
        mut shell: CommandBuilder,
        cols: u16,
        rows: u16,
        out: Channel<TerminalEvent>,
    ) -> Result<Self, WorkspaceError> {
        let clean_path = crate::workspace::display_path(root);
        shell.cwd(clean_path);
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| WorkspaceError::Io {
                message: e.to_string(),
            })?;

        let mut child = pair.slave.spawn_command(shell).map_err(|e| {
            WorkspaceError::Io {
                message: e.to_string(),
            }
        })?;
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| {
            WorkspaceError::Io {
                message: e.to_string(),
            }
        })?;

        let mut reader = pair.master.try_clone_reader().map_err(|e| {
            WorkspaceError::Io {
                message: e.to_string(),
            }
        })?;

        let master = Arc::new(Mutex::new(Some(pair.master)));
        let master_for_waiter = Arc::clone(&master);
        let killed = Arc::new(AtomicBool::new(false));
        let killed_for_waiter = Arc::clone(&killed);

        // Reader thread: streams output to the Channel until EOF, then sends Exit
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let mut tmp = [0u8; 4096];
            loop {
                match reader.read(&mut tmp) {
                    Ok(0) => break,
                    Ok(n) => {
                        buf.extend_from_slice(&tmp[..n]);
                        let text = take_utf8(&mut buf);
                        if !text.is_empty() && out.send(TerminalEvent::Output(text)).is_err() {
                            return;
                        }
                    }
                    Err(_) => break,
                }
            }
            if !buf.is_empty() {
                let text = String::from_utf8_lossy(&buf).into_owned();
                let _ = out.send(TerminalEvent::Output(text));
            }
            let _ = out.send(TerminalEvent::Exit);
        });

        // Waiter thread: monitors child process. When it exits (or is killed),
        // drops master so ConPTY closes and reader thread gets EOF.
        std::thread::spawn(move || {
            loop {
                if killed_for_waiter.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    break;
                }
                match child.try_wait() {
                    Ok(Some(_status)) => break,
                    Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
            // Drop master PTY so the reader thread's pipe unblocks on ConPTY
            if let Ok(mut lock) = master_for_waiter.lock() {
                let _ = lock.take();
            }
        });

        Ok(Self {
            master,
            writer,
            killed,
        })
    }

    pub fn write(&mut self, data: &str) -> Result<(), WorkspaceError> {
        self.writer
            .write_all(data.as_bytes())
            .map_err(|e| WorkspaceError::Io {
                message: e.to_string(),
            })?;
        self.writer.flush().map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), WorkspaceError> {
        let lock = self
            .master
            .lock()
            .map_err(|_| WorkspaceError::Storage {
                message: "poisoned terminal master lock".into(),
            })?;
        if let Some(master) = lock.as_ref() {
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| WorkspaceError::Io {
                    message: e.to_string(),
                })?;
        }
        Ok(())
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        self.killed.store(true, Ordering::SeqCst);
        if let Ok(mut lock) = self.master.lock() {
            let _ = lock.take();
        }
    }
}

#[derive(Default)]
pub struct TerminalState {
    pub term: Mutex<Option<Terminal>>,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn take_utf8_table() {
        // é is [0xC3, 0xA9]
        let mut buf = vec![0xC3];
        assert_eq!(take_utf8(&mut buf), "");
        assert_eq!(buf, vec![0xC3]);
        buf.push(0xA9);
        assert_eq!(take_utf8(&mut buf), "é");
        assert!(buf.is_empty());

        // € is [0xE2, 0x82, 0xAC]
        let mut buf = vec![0xE2];
        assert_eq!(take_utf8(&mut buf), "");
        assert_eq!(buf, vec![0xE2]);
        buf.extend_from_slice(&[0x82, 0xAC]);
        assert_eq!(take_utf8(&mut buf), "€");
        assert!(buf.is_empty());

        // invalid byte 0xFF in the middle
        let mut buf = vec![0x61, 0xFF, 0x62];
        assert_eq!(take_utf8(&mut buf), "a\u{FFFD}b");
        assert!(buf.is_empty());
    }
}

