// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `aidp --pdf-text <pdf> <out>`: the child that reads one attached PDF's text
    // (attachments/pdf.rs), so a parser crash never takes the app down.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some(aidp_lib::attachments::pdf::PDF_TEXT_FLAG) {
        let pdf = args.get(2).map_or("", String::as_str);
        let out = args.get(3).map_or("", String::as_str);
        std::process::exit(aidp_lib::attachments::pdf::run_child(pdf, out));
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
