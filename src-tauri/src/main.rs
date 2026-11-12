// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `aidp --pdf-text <pdf> <out>`: the child that reads one attached PDF's text
    // (attachments/pdf.rs), so a parser crash never takes the app down.
    if let Some((pdf, out)) = aidp_lib::attachments::pdf::child_args(std::env::args_os().skip(1)) {
        std::process::exit(aidp_lib::attachments::pdf::run_child(&pdf, &out));
    }

    // SAFETY: before Tauri or anything else starts a thread.
    #[cfg(unix)]
    unsafe {
        aidp_lib::login_path::apply_login_path();
    }
    if let Err(e) = aidp_lib::run() {
        eprintln!("A.I.D.P failed to start: {e}");
        std::process::exit(1);
    }
}
