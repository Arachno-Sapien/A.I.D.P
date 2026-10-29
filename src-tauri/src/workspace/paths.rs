use super::WorkspaceError;
use std::path::{Component, Path, PathBuf};

pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, WorkspaceError> {
    if rel.contains(':') || rel.contains('\0') {
        return Err(WorkspaceError::OutsideFolder);
    }

    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }

    let rel_path = Path::new(rel);
    for c in rel_path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(WorkspaceError::OutsideFolder);
            }
        }
    }

    let mut abs = root.to_path_buf();
    for c in rel_path.components() {
        if let Component::Normal(part) = c {
            abs.push(part);
        }
    }

    let canonical = match std::fs::canonicalize(&abs) {
        Ok(p) => p,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                return Err(WorkspaceError::NotFound);
            } else {
                return Err(WorkspaceError::Io {
                    message: e.to_string(),
                });
            }
        }
    };

    if !canonical.starts_with(root) {
        return Err(WorkspaceError::OutsideFolder);
    }

    Ok(canonical)
}

pub fn to_rel(root: &Path, abs: &Path) -> Option<String> {
    let stripped = abs.strip_prefix(root).ok()?;
    let parts: Vec<String> = stripped
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    Some(parts.join("/"))
}
