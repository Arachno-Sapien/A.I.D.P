use super::WorkspaceError;
use std::path::{Component, Path, PathBuf};

fn check_components(rel: &str) -> Result<Vec<Component<'_>>, WorkspaceError> {
    if rel.contains(':') || rel.contains('\0') {
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

    if !canonical.starts_with(root) {
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

    if std::fs::symlink_metadata(&candidate).is_ok() {
        return Err(WorkspaceError::AlreadyExists);
    }

    let mut current = candidate.as_path();
    let mut missing_suffix = Vec::new();

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

    if !canon_ancestor.starts_with(&canon_root) {
        return Err(WorkspaceError::OutsideFolder);
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
