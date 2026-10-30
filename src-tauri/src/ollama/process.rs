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

    // The Ollama app keeps its CLI inside the bundle and links it into
    // /usr/local/bin; Homebrew installs to /opt/homebrew/bin on Apple silicon.
    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/Applications/Ollama.app/Contents/Resources/ollama",
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
        ] {
            let candidate = PathBuf::from(candidate);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let path_var = std::env::var_os("PATH")?;
    first_in(std::env::split_paths(&path_var), EXE)
}

#[cfg(target_os = "windows")]
const EXE: &str = "ollama.exe";
#[cfg(not(target_os = "windows"))]
const EXE: &str = "ollama";

/// The first directory holding `exe`. Relative entries (such as `.` or an
/// empty one) are skipped: they resolve against the app's working directory,
/// where a planted binary could be picked up.
fn first_in(dirs: impl IntoIterator<Item = PathBuf>, exe: &str) -> Option<PathBuf> {
    dirs.into_iter()
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn relative_path_entries_are_skipped() {
        // Tests run with the package folder as working directory, so a relative
        // entry naming a folder there really resolves; it must still be skipped.
        let rel = PathBuf::from("target").join(format!("find-probe-{}", std::process::id()));
        std::fs::create_dir_all(&rel).unwrap();
        std::fs::write(rel.join(EXE), b"").unwrap();
        let abs = std::fs::canonicalize(&rel).unwrap();

        let from_relative = first_in([rel.clone()], EXE);
        let from_absolute = first_in([abs.clone()], EXE);
        std::fs::remove_dir_all(&rel).unwrap();

        assert_eq!(from_relative, None);
        assert_eq!(from_absolute, Some(abs.join(EXE)));
    }
}
