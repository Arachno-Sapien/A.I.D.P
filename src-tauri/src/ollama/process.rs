use crate::ollama::OLLAMA_DOWNLOAD_URL;
use std::path::{Path, PathBuf};

pub fn find_binary() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
            let candidate = PathBuf::from(local_appdata)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            #[cfg(target_os = "windows")]
            let candidate = dir.join("ollama.exe");
            #[cfg(not(target_os = "windows"))]
            let candidate = dir.join("ollama");

            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

pub fn start_serve(bin: &Path) -> std::io::Result<()> {
    let mut cmd = std::process::Command::new(bin);
    cmd.arg("serve")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()?;
    Ok(())
}

pub fn open_download_page() -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", OLLAMA_DOWNLOAD_URL]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.arg(OLLAMA_DOWNLOAD_URL);
        cmd.spawn()?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(OLLAMA_DOWNLOAD_URL);
        cmd.spawn()?;
    }

    Ok(())
}
