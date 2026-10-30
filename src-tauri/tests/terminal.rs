#![allow(clippy::unwrap_used)]

mod common;

use aidp_lib::tools::pty::{Terminal, TerminalEvent};
use common::{capture_terminal, TempDir};
use portable_pty::CommandBuilder;
use std::time::{Duration, Instant};

#[test]
fn terminal_runs_in_the_folder() {
    let temp = TempDir::new();
    let (channel, events) = capture_terminal();

    let shell = if cfg!(windows) {
        CommandBuilder::new("cmd.exe")
    } else {
        CommandBuilder::new("sh")
    };

    let mut term = Terminal::start(temp.path(), shell, 80, 24, channel).unwrap();

    let cmd = if cfg!(windows) { "cd\r\n" } else { "pwd\n" };
    term.write(cmd).unwrap();

    let folder_name = temp.path().file_name().unwrap().to_str().unwrap();

    let start = Instant::now();
    let mut found = false;
    while start.elapsed() < Duration::from_secs(10) {
        let lock = events.lock().unwrap();
        let all_output: String = lock
            .iter()
            .filter_map(|e| match e {
                TerminalEvent::Output(s) => Some(s.as_str()),
                _ => None,
            })
            .collect();
        if all_output.contains("\u{1b}[6n") {
            let _ = term.write("\u{1b}[1;1R");
        }
        if all_output.contains(folder_name) {
            found = true;
            break;
        }
        drop(lock);
        let _ = term.write(cmd);
        std::thread::sleep(Duration::from_millis(100));
    }

    assert!(found, "terminal output did not contain folder name within 10s");
}

#[test]
fn terminal_exit_is_reported() {
    let temp = TempDir::new();
    let (channel, events) = capture_terminal();

    let shell = if cfg!(windows) {
        CommandBuilder::new("cmd.exe")
    } else {
        CommandBuilder::new("sh")
    };

    let mut term = Terminal::start(temp.path(), shell, 80, 24, channel).unwrap();

    let start = Instant::now();
    let mut exited = false;
    let mut answered_cursor = false;
    while start.elapsed() < Duration::from_secs(10) {
        let lock = events.lock().unwrap();
        eprintln!("Exit test events: {:?}", *lock);
        if lock.iter().any(|e| matches!(e, TerminalEvent::Exit)) {
            exited = true;
            break;
        }
        let all_output: String = lock
            .iter()
            .filter_map(|e| match e {
                TerminalEvent::Output(s) => Some(s.as_str()),
                _ => None,
            })
            .collect();
        if all_output.contains("\u{1b}[6n") && !answered_cursor {
            let _ = term.write("\u{1b}[1;1R");
            answered_cursor = true;
        }
        drop(lock);
        let _ = term.write("exit\r\n");
        std::thread::sleep(Duration::from_millis(100));
    }

    assert!(exited, "terminal exit was not reported within 10s");
}

