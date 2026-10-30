use super::files::{decode, walker, MAX_FILE_BYTES};
use super::paths::{resolve, to_rel};
use super::secret_files::{has_private_key, is_secret};
use super::WorkspaceError;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct Match {
    pub path: String,
    pub line: u32,
    pub text: String,
}

pub fn search(
    root: &Path,
    rel: &str,
    query: &str,
    max: usize,
) -> Result<(Vec<Match>, bool), WorkspaceError> {
    let abs = resolve(root, rel)?;
    if !abs.is_dir() {
        return Err(WorkspaceError::NotFound);
    }

    let query_lower = query.to_lowercase();
    let mut matches = Vec::new();
    let mut files_walked = 0usize;
    let mut has_more = false;

    let walk = walker(&abs, None);
    for entry_res in walk {
        // An unreadable folder is skipped, not fatal.
        let Ok(entry) = entry_res else { continue };
        // Regular files only: a link named notes.txt may point at .env or outside the folder.
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }

        let name = entry.file_name().to_string_lossy();
        if is_secret(&name) {
            continue;
        }

        files_walked += 1;
        if files_walked > 20_000 {
            has_more = true;
            break;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }

        let bytes = match fs::read(entry.path()) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let decoded = match decode(&bytes) {
            Ok((text, _, _)) => text,
            Err(_) => continue,
        };

        if has_private_key(&decoded) {
            continue;
        }

        let rel_path = to_rel(root, entry.path()).unwrap_or_else(|| name.to_string());

        for (idx, line) in decoded.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                let trimmed = line.trim();
                let text = if trimmed.chars().count() > 200 {
                    trimmed.chars().take(200).collect()
                } else {
                    trimmed.to_string()
                };

                matches.push(Match {
                    path: rel_path.clone(),
                    line: (idx + 1) as u32,
                    text,
                });

                if matches.len() >= max {
                    has_more = true;
                    return Ok((matches, has_more));
                }
            }
        }
    }

    Ok((matches, has_more))
}

