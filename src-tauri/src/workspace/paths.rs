use super::WorkspaceError;
use std::path::{Component, Path, PathBuf};

/// The `.git` folder is refused like a path outside the folder: its config can
/// hold credentials and its hooks run code. Case-insensitive, as on Windows.
fn has_git_part(p: &Path) -> bool {
    p.components()
        .any(|c| matches!(c, Component::Normal(n) if n.eq_ignore_ascii_case(".git")))
}

pub fn in_git_dir(rel: &str) -> bool {
    has_git_part(Path::new(rel))
}

fn check_components(rel: &str) -> Result<Vec<Component<'_>>, WorkspaceError> {
    if rel.contains(':') || rel.contains('\0') || in_git_dir(rel) {
        return Err(WorkspaceError::OutsideFolder);
    }

    let rel_path = Path::new(rel);
    let mut parts = Vec::new();
    for c in rel_path.components() {
        match c {
            Component::Normal(_) => parts.push(c),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(WorkspaceError::OutsideFolder);
            }
        }
    }
    Ok(parts)
}

pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, WorkspaceError> {
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }

    let parts = check_components(rel)?;
    let mut abs = root.to_path_buf();
    for c in parts {
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

    // A link may land in .git under another name.
    if !canonical.starts_with(root) || canonical.strip_prefix(root).is_ok_and(has_git_part) {
        return Err(WorkspaceError::OutsideFolder);
    }

    Ok(canonical)
}

pub fn resolve_new(root: &Path, rel: &str) -> Result<PathBuf, WorkspaceError> {
    if rel.is_empty() {
        return Err(WorkspaceError::AlreadyExists);
    }

    let parts = check_components(rel)?;
    if parts.is_empty() {
        return Err(WorkspaceError::AlreadyExists);
    }

    let mut candidate = root.to_path_buf();
    for c in &parts {
        if let Component::Normal(part) = c {
            candidate.push(part);
        }
    }

    // Check the folder boundary before existence, so "already exists" never
    // reveals a file outside the folder through a link.
    let Some(mut current) = candidate.parent() else {
        return Err(WorkspaceError::OutsideFolder);
    };
    let mut missing_suffix: Vec<&std::ffi::OsStr> = candidate.file_name().into_iter().collect();

    while std::fs::symlink_metadata(current).is_err() {
        if let Some(file_name) = current.file_name() {
            missing_suffix.push(file_name);
        }
        if let Some(parent) = current.parent() {
            current = parent;
        } else {
            return Err(WorkspaceError::OutsideFolder);
        }
    }

    let canon_ancestor = std::fs::canonicalize(current).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    let canon_root = std::fs::canonicalize(root).map_err(|e| WorkspaceError::Io {
        message: e.to_string(),
    })?;

    if !canon_ancestor.starts_with(&canon_root)
        || canon_ancestor.strip_prefix(&canon_root).is_ok_and(has_git_part)
    {
        return Err(WorkspaceError::OutsideFolder);
    }

    if std::fs::symlink_metadata(&candidate).is_ok() {
        return Err(WorkspaceError::AlreadyExists);
    }

    let mut result = canon_ancestor;
    for part in missing_suffix.into_iter().rev() {
        result.push(part);
    }

    Ok(result)
}

pub fn to_rel(root: &Path, abs: &Path) -> Option<String> {
    let stripped = abs.strip_prefix(root).ok()?;
    let parts: Vec<String> = stripped
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    Some(parts.join("/"))
}
