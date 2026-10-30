//! An app opened from Finder or a desktop menu gets a minimal PATH, so the
//! commands, the terminal and the Ollama lookup would miss `npm`, `cargo` or
//! `ollama`. At start the app asks the user's login shell for its PATH instead.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const START: &str = "__AIDP_PATH_START__";
const END: &str = "__AIDP_PATH_END__";

/// The `PATH=` value the shell printed between the markers, if not empty.
pub fn extract_path(output: &str) -> Option<&str> {
    let (_, rest) = output.split_once(START)?;
    let (block, _) = rest.split_once(END)?;
    block
        .lines()
        .find_map(|line| line.strip_prefix("PATH="))
        .filter(|path| !path.is_empty())
}

/// Runs `cmd` and returns its standard output, or `None` if it fails or is
/// still running after `limit` (it is then killed).
pub fn run_with_limit(mut cmd: Command, limit: Duration) -> Option<String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    // ponytail: reads to the end of the output, so a process the shell leaves
    // running with its output open costs the whole limit; stop at the end marker
    // if that ever shows up.
    std::thread::spawn(move || {
        let mut out = String::new();
        let read = stdout.read_to_string(&mut out).is_ok();
        let _ = tx.send(read.then_some(out));
    });
    match rx.recv_timeout(limit) {
        Ok(out) => {
            let _ = child.wait();
            out
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}

/// Replaces `PATH` with the login shell's when the app was not started from a
/// terminal. Leaves it alone if there is no `$SHELL` or the shell fails or
/// takes more than five seconds.
///
/// # Safety
///
/// Call before any other thread starts: it sets an environment variable.
#[cfg(unix)]
pub unsafe fn apply_login_path() {
    use std::io::IsTerminal;
    if std::io::stdin().is_terminal() {
        return;
    }
    let Some(shell) = std::env::var_os("SHELL") else {
        return;
    };
    let mut cmd = Command::new(shell);
    cmd.arg("-ilc")
        .arg(format!("printf '\\n{START}\\n'; env; printf '\\n{END}\\n'"));
    let Some(out) = run_with_limit(cmd, Duration::from_secs(5)) else {
        return;
    };
    if let Some(path) = extract_path(&out) {
        // SAFETY: the caller guarantees no other thread runs yet; the reader
        // thread in `run_with_limit` only reads a pipe.
        unsafe { std::env::set_var("PATH", path) };
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::time::{Duration, Instant};

    #[test]
    fn extract_path_takes_the_marked_value() {
        let out = "motd\n__AIDP_PATH_START__\nHOME=/h\nPATH=/a:/b\n__AIDP_PATH_END__\n";
        assert_eq!(extract_path(out), Some("/a:/b"));
        assert_eq!(extract_path("PATH=/a:/b\n"), None);
        assert_eq!(
            extract_path("__AIDP_PATH_START__\nPATH=\n__AIDP_PATH_END__\n"),
            None
        );
        assert_eq!(
            extract_path("PATH=/x\n__AIDP_PATH_START__\nHOME=/h\n__AIDP_PATH_END__\nPATH=/y\n"),
            None
        );
        assert_eq!(extract_path("__AIDP_PATH_START__\nPATH=/a:/b\n"), None);
    }

    fn sleeper() -> Command {
        if cfg!(windows) {
            let mut c = Command::new("ping");
            c.args(["-n", "10", "127.0.0.1"]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", "sleep 10"]);
            c
        }
    }

    fn says_hi() -> Command {
        if cfg!(windows) {
            let mut c = Command::new("cmd");
            c.args(["/C", "echo hi"]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", "printf hi"]);
            c
        }
    }

    #[test]
    fn run_with_limit_stops_a_hung_command() {
        let start = Instant::now();
        assert_eq!(run_with_limit(sleeper(), Duration::from_secs(1)), None);
        assert!(start.elapsed() < Duration::from_secs(3));

        let out = run_with_limit(says_hi(), Duration::from_secs(5)).unwrap();
        assert_eq!(out.trim(), "hi");
    }
}
