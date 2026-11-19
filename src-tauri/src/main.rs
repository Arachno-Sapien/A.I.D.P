// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// The system allocator; only the PDF child turns its heap cap on.
#[global_allocator]
static ALLOC: aidp_lib::attachments::pdf::CappedAlloc = aidp_lib::attachments::pdf::CappedAlloc::new();

fn main() {
    // `aidp --pdf-text <pdf> <out> [<bytes>]`: the child that reads one attached PDF's
    // text (attachments/pdf.rs), so a parser crash or a decompression bomb never
    // takes the app, or the machine's memory, down.
    if let Some((pdf, out, cap)) = aidp_lib::attachments::pdf::child_args(std::env::args_os().skip(1)) {
        ALLOC.set_limit(cap);
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
