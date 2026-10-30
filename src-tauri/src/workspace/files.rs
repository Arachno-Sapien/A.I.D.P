use super::paths::{resolve, to_rel};
use super::secret_files::is_secret;
use super::WorkspaceError;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::io;
use std::path::Path;
use std::time::SystemTime;

pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Type, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub text: String,
    pub version: String,
    pub line_ending: LineEnding,
    pub has_bom: bool,
    pub is_secret: bool,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriteFile {
    pub path: String,
    pub text: String,
    pub line_ending: LineEnding,
    pub has_bom: bool,
    pub expected_version: Option<String>,
}

pub fn decode(bytes: &[u8]) -> Result<(String, LineEnding, bool), WorkspaceError> {
    let check_len = bytes.len().min(8000);
    if bytes[..check_len].contains(&b'\0') {
        return Err(WorkspaceError::NotText);
    }

    let (payload, has_bom) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (&bytes[3..], true)
    } else {
        (bytes, false)
    };

    let text_str = std::str::from_utf8(payload).map_err(|_| WorkspaceError::NotText)?;

    let mut crlf_count = 0usize;
    let mut lf_count = 0usize;
    let b = text_str.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\n' {
            if i > 0 && b[i - 1] == b'\r' {
                crlf_count += 1;
            } else {
                lf_count += 1;
            }
        }
        i += 1;
    }

    let line_ending = if crlf_count > lf_count {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };

    let normalized = text_str.replace("\r\n", "\n");
    Ok((normalized, line_ending, has_bom))
}

pub fn encode(text: &str, le: LineEnding, bom: bool) -> Vec<u8> {
    let normalized = text.replace("\r\n", "\n");
    let mut out = Vec::new();
    if bom {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    match le {
        LineEnding::Lf => {
            out.extend_from_slice(normalized.as_bytes());
        }
        LineEnding::Crlf => {
            let with_crlf = normalized.replace('\n', "\r\n");
            out.extend_from_slice(with_crlf.as_bytes());
        }
    }
    out
}

pub(crate) fn walker(abs: &Path, max_depth: Option<usize>) -> ignore::Walk {
    let mut builder = ignore::WalkBuilder::new(abs);
    builder
        .max_depth(max_depth)
        .hidden(false)
        .parents(true)
        .require_git(true)
        .sort_by_file_name(|a, b| a.cmp(b))
        .filter_entry(|e| e.file_name() != ".git");
    builder.build()
}

pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<DirEntry>, WorkspaceError> {
    let abs = resolve(root, rel)?;
    if !abs.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let walk = walker(&abs, Some(1));

    let mut entries = Vec::new();
    for entry_res in walk {
        let entry = entry_res.map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?;
        if entry.depth() == 0 {
            continue;
        }

        let file_type = entry.file_type();
        let is_symlink = file_type.as_ref().is_some_and(|ft| ft.is_symlink());
        let is_dir = if is_symlink {
            false
        } else {
            file_type.as_ref().is_some_and(|ft| ft.is_dir())
        };

        let name = entry.file_name().to_string_lossy().to_string();
        let path = to_rel(root, entry.path()).unwrap_or_else(|| name.clone());

        entries.push(DirEntry {
            name,
            path,
            is_dir,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(entries)
}

pub fn read_file(root: &Path, rel: &str) -> Result<FileContent, WorkspaceError> {
    let abs = resolve(root, rel)?;
    let meta = fs::metadata(&abs).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => WorkspaceError::NotFound,
        _ => WorkspaceError::Io {
            message: e.to_string(),
        },
    })?;

    if meta.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    if meta.len() > MAX_FILE_BYTES {
        let bytes = u32::try_from(meta.len()).unwrap_or(u32::MAX);
        return Err(WorkspaceError::TooLarge { bytes });
    }

    let bytes = fs::read(&abs).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let (text, line_ending, has_bom) = decode(&bytes)?;

    let mtime_nanos = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let version = format!("{mtime_nanos}-{}", meta.len());

    let path = to_rel(root, &abs).unwrap_or_else(|| rel.to_string());
    // Check the link's target too: a link named notes.txt may point at .env.
    let is_secret = is_secret(rel)
        || is_secret(&path)
        || super::secret_files::has_private_key(&text);

    Ok(FileContent {
        path,
        text,
        version,
        line_ending,
        has_bom,
        is_secret,
    })
}

pub fn write_file(root: &Path, req: WriteFile) -> Result<String, WorkspaceError> {
    let abs = resolve(root, &req.path)?;
    let meta = fs::metadata(&abs).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => WorkspaceError::NotFound,
        _ => WorkspaceError::Io {
            message: e.to_string(),
        },
    })?;

    if meta.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let mtime_nanos = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let current_version = format!("{mtime_nanos}-{}", meta.len());

    if req
        .expected_version
        .as_ref()
        .is_some_and(|expected| expected != &current_version)
    {
        return Err(WorkspaceError::ChangedOnDisk);
    }

    let bytes = encode(&req.text, req.line_ending, req.has_bom);
    fs::write(&abs, bytes).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let new_meta = fs::metadata(&abs).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;
    let new_mtime = new_meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    Ok(format!("{new_mtime}-{}", new_meta.len()))
}

pub fn list_tree(
    root: &Path,
    rel: &str,
    max: usize,
) -> Result<(Vec<String>, bool), WorkspaceError> {
    let abs = resolve(root, rel)?;
    if !abs.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let walk = walker(&abs, None);
    let mut entries = Vec::new();
    let mut has_more = false;

    for entry_res in walk {
        let entry = entry_res.map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?;
        if entry.depth() == 0 {
            continue;
        }

        let name = entry.file_name().to_string_lossy();
        if is_secret(&name) {
            continue;
        }

        let mut rel_path = to_rel(root, entry.path()).unwrap_or_else(|| name.to_string());
        let file_type = entry.file_type();
        let is_symlink = file_type.as_ref().is_some_and(|ft| ft.is_symlink());
        let is_dir = if is_symlink {
            false
        } else {
            file_type.as_ref().is_some_and(|ft| ft.is_dir())
        };

        if is_dir {
            rel_path.push('/');
        }

        if entries.len() >= max {
            has_more = true;
            break;
        }
        entries.push(rel_path);
    }

    Ok((entries, has_more))
}

pub fn create_file(root: &Path, rel: &str, text: &str) -> Result<String, WorkspaceError> {
    let abs = super::paths::resolve_new(root, rel)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| WorkspaceError::Io {
            message: e.to_string(),
        })?;
    }

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs)
        .map_err(|e| match e.kind() {
            io::ErrorKind::AlreadyExists => WorkspaceError::AlreadyExists,
            _ => WorkspaceError::Io {
                message: e.to_string(),
            },
        })?;

    use std::io::Write;
    let bytes = encode(text, LineEnding::Lf, false);
    file.write_all(&bytes).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let meta = file.metadata().map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let mtime_nanos = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok(format!("{mtime_nanos}-{}", meta.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_detects_crlf_and_bom() {
        let (text, le, has_bom) = decode(b"\xEF\xBB\xBFa\r\nb\r\n").unwrap();
        assert_eq!(text, "a\nb\n");
        assert_eq!(le, LineEnding::Crlf);
        assert!(has_bom);
    }

    #[test]
    fn decode_keeps_lf() {
        let (text, le, has_bom) = decode(b"a\nb").unwrap();
        assert_eq!(text, "a\nb");
        assert_eq!(le, LineEnding::Lf);
        assert!(!has_bom);
    }

    #[test]
    fn decode_picks_the_dominant_ending() {
        let (text, le, _) = decode(b"a\r\nb\r\nc\n").unwrap();
        assert_eq!(le, LineEnding::Crlf);
        assert_eq!(text, "a\nb\nc\n");
    }

    #[test]
    fn decode_refuses_binary() {
        assert_eq!(decode(b"ab\0cd"), Err(WorkspaceError::NotText));
        assert_eq!(decode(&[0xff, 0xfe, 0x41]), Err(WorkspaceError::NotText));
    }

    #[test]
    fn encode_round_trips() {
        let samples: &[&[u8]] = &[b"\xEF\xBB\xBFa\r\nb\r\n", b"a\nb"];
        for sample in samples {
            let (text, le, bom) = decode(sample).unwrap();
            assert_eq!(encode(&text, le, bom), *sample);
        }
    }

    #[test]
    fn encode_never_doubles_cr() {
        assert_eq!(encode("a\r\nb\n", LineEnding::Crlf, false), b"a\r\nb\r\n");
    }
}

