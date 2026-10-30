// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // SAFETY: first line of main, before Tauri or anything else starts a thread.
    #[cfg(unix)]
    unsafe {
        aidp_lib::login_path::apply_login_path();
    }
    if let Err(e) = aidp_lib::run() {
        eprintln!("A.I.D.P failed to start: {e}");
        std::process::exit(1);
    }
}
