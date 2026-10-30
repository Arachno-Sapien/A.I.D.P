use crate::tools::{ToolOutcome, LIST_LIMIT, SEARCH_LIMIT};
use crate::workspace::files::{self, list_tree, LineEnding};
use crate::workspace::paths;
use crate::workspace::search as ws_search;
use crate::workspace::secret_files::is_secret;
use crate::workspace::WorkspaceError;
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, PartialEq, Clone)]
pub enum ToolInput {
    ListFiles {
        path: String,
    },
    ReadFile {
        path: String,
        start_line: Option<u32>,
        end_line: Option<u32>,
    },
    Search {
        query: String,
        path: String,
    },
    EditFile {
        path: String,
        old_text: String,
        new_text: String,
    },
    CreateFile {
        path: String,
        text: String,
    },
    RunCommand {
        command: String,
    },
}

#[derive(Deserialize)]
struct ListFilesArgs {
    #[serde(default)]
    path: String,
}

#[derive(Deserialize)]
struct ReadFileArgs {
    path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
}

#[derive(Deserialize)]
struct SearchArgs {
    query: String,
    #[serde(default)]
    path: String,
}

#[derive(Deserialize)]
struct EditFileArgs {
    path: String,
    old_text: String,
    new_text: String,
}

#[derive(Deserialize)]
struct CreateFileArgs {
    path: String,
    text: String,
}

#[derive(Deserialize)]
struct RunCommandArgs {
    command: String,
}

pub fn parse(name: &str, input: &serde_json::Value) -> Result<ToolInput, String> {
    if !input.is_object() {
        return Err(format!(
            "Invalid arguments for {name}: they were not valid JSON."
        ));
    }

    match name {
        "list_files" => {
            let args: ListFilesArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            Ok(ToolInput::ListFiles { path: args.path })
        }
        "read_file" => {
            let args: ReadFileArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            Ok(ToolInput::ReadFile {
                path: args.path,
                start_line: args.start_line,
                end_line: args.end_line,
            })
        }
        "search" => {
            let args: SearchArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            Ok(ToolInput::Search {
                query: args.query,
                path: args.path,
            })
        }
        "edit_file" => {
            let args: EditFileArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            Ok(ToolInput::EditFile {
                path: args.path,
                old_text: args.old_text,
                new_text: args.new_text,
            })
        }
        "create_file" => {
            let args: CreateFileArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            Ok(ToolInput::CreateFile {
                path: args.path,
                text: args.text,
            })
        }
        "run_command" => {
            let args: RunCommandArgs = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid arguments for {name}: {e}."))?;
            // A carriage return is allowed only as part of CRLF.
            let lone_cr = args.command.replace("\r\n", "").contains('\r');
            let hidden = args.command.chars().find(|&c| is_hidden(c));
            if let Some(c) = hidden.or(lone_cr.then_some('\r')) {
                return Err(format!(
                    "Invalid arguments for {name}: the command contains a hidden or control character (U+{:04X}), which would make the approval card differ from what runs. Use plain characters.",
                    c as u32
                ));
            }
            if let Some(c) = args.command.chars().find(|&c| turns_into_ascii(c)) {
                return Err(format!(
                    "Invalid arguments for {name}: the command contains a character (U+{:04X}) that some programs turn into the ASCII character it looks like. Use plain ASCII.",
                    c as u32
                ));
            }
            Ok(ToolInput::RunCommand {
                command: args.command,
            })
        }
        _ => Err(format!("There is no tool named {name}.")),
    }
}

/// Characters that hide or reorder text on screen, so the user must see exactly
/// what runs: controls (tab and line breaks are visible and allowed), every
/// Default_Ignorable_Code_Point of Unicode 15 (bidi controls, zero-width,
/// variation selectors, tags, Hangul fillers, ...), the line and paragraph
/// separators, the other format controls, and private use. Unassigned code
/// points are left out: they render as visible boxes.
fn is_hidden(c: char) -> bool {
    (c.is_control() && !matches!(c, '\t' | '\n' | '\r'))
        || matches!(
            c,
            '\u{00AD}'
                | '\u{034F}'
                | '\u{061C}'
                | '\u{115F}'..='\u{1160}'
                | '\u{17B4}'..='\u{17B5}'
                | '\u{180B}'..='\u{180F}'
                | '\u{200B}'..='\u{200F}'
                | '\u{2028}'..='\u{202E}'
                | '\u{2060}'..='\u{206F}'
                | '\u{3164}'
                | '\u{E000}'..='\u{F8FF}'
                | '\u{FE00}'..='\u{FE0F}'
                | '\u{FEFF}'
                | '\u{FFA0}'
                | '\u{FFF0}'..='\u{FFFB}'
                | '\u{110BD}'
                | '\u{110CD}'
                | '\u{13430}'..='\u{1343F}'
                | '\u{1BCA0}'..='\u{1BCA3}'
                | '\u{1D173}'..='\u{1D17A}'
                | '\u{E0000}'..='\u{E0FFF}'
                | '\u{F0000}'..='\u{10FFFF}'
        )
}

/// Characters some programs turn into the ASCII punctuation or space they look
/// like, so the card would read differently from what runs: the full-width
/// forms (U+FF01 to U+FF5E) on every OS, and on Windows anything the ANSI code
/// page's best fit maps to one ASCII byte that is not a letter or digit (the
/// WorstFit attacks, such as `∕` to `/`). A program that reads its command line
/// through the ANSI API gets it converted that way. The OEM code page is left
/// out: it converts console text, not command lines, and would also refuse
/// curly quotes and dashes.
fn turns_into_ascii(c: char) -> bool {
    ('\u{FF01}'..='\u{FF5E}').contains(&c) || best_fits_to_ascii(c)
}

#[cfg(windows)]
fn best_fits_to_ascii(c: char) -> bool {
    use windows_sys::Win32::Globalization::{GetACP, WideCharToMultiByte};
    const CP_UTF8: u32 = 65001;
    // SAFETY: takes no arguments.
    let cp = unsafe { GetACP() };
    // UTF-8 has no best fit, and it rejects the `used_default` argument.
    if c.is_ascii() || cp == CP_UTF8 {
        return false;
    }
    let mut buf = [0u16; 2];
    let wide = c.encode_utf16(&mut buf);
    let mut out = [0u8; 4];
    let mut used_default = 0;
    // SAFETY: both buffers outlive the call and their lengths are passed.
    let n = unsafe {
        WideCharToMultiByte(
            cp,
            0,
            wide.as_ptr(),
            wide.len() as i32,
            out.as_mut_ptr(),
            out.len() as i32,
            std::ptr::null(),
            &mut used_default,
        )
    };
    n == 1 && used_default == 0 && out[0].is_ascii() && !out[0].is_ascii_alphanumeric()
}

#[cfg(not(windows))]
fn best_fits_to_ascii(_c: char) -> bool {
    false
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolRun {
    pub for_model: String,
    pub is_error: bool,
    pub outcome: ToolOutcome,
}

pub fn refused(err: &WorkspaceError, path: &str) -> ToolRun {
    let for_model = match err {
        WorkspaceError::OutsideFolder if paths::in_git_dir(path) => {
            "Refused: tools cannot use the .git folder. To see history or status, ask to run a git command.".to_string()
        }
        WorkspaceError::OutsideFolder => {
            "Refused: paths must be relative to the project folder (like src/main.rs) and stay inside it.".to_string()
        }
        WorkspaceError::NotFound => format!("Not found: {path}"),
        WorkspaceError::NotText => format!("{path} is not a text file."),
        WorkspaceError::TooLarge { .. } => format!("{path} is larger than 2 MB."),
        WorkspaceError::ChangedOnDisk => {
            format!("{path} changed on disk after you read it; read it again before editing.")
        }
        WorkspaceError::AlreadyExists => {
            format!("{path} already exists. Use edit_file to change it.")
        }
        WorkspaceError::Io { message } => message.clone(),
        WorkspaceError::Storage { message } => message.clone(),
        WorkspaceError::NoFolder => "No folder is open.".to_string(),
    };
    ToolRun {
        outcome: ToolOutcome::Error {
            message: for_model.clone(),
        },
        is_error: true,
        for_model,
    }
}

pub fn secret_refused(path: &str) -> ToolRun {
    let for_model = format!(
        "Refused: {path} looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
    ToolRun {
        outcome: ToolOutcome::Error {
            message: for_model.clone(),
        },
        is_error: true,
        for_model,
    }
}

pub fn list_files(root: &Path, path: &str) -> ToolRun {
    match list_tree(root, path, LIST_LIMIT) {
        Ok((entries, more)) => {
            let count = entries.len();
            let mut lines = entries.join("\n");
            if more {
                if !lines.is_empty() {
                    lines.push('\n');
                }
                lines.push_str("(more entries not shown; list a subfolder)");
            }
            let summary = format!("{count} entries");
            ToolRun {
                for_model: lines,
                is_error: false,
                outcome: ToolOutcome::Ok { summary },
            }
        }
        Err(err) => refused(&err, path),
    }
}

pub fn read_file(
    root: &Path,
    path: &str,
    start_line: Option<u32>,
    end_line: Option<u32>,
    limit: usize,
) -> ToolRun {
    match files::read_file(root, path) {
        Ok(file) => {
            if file.is_secret {
                return secret_refused(path);
            }

            let all_lines: Vec<&str> = file.text.lines().collect();
            let total = all_lines.len() as u32;
            if total == 0 {
                let for_model = format!("{path}, lines 0-0 of 0:\n");
                return ToolRun {
                    for_model,
                    is_error: false,
                    outcome: ToolOutcome::Ok {
                        summary: "lines 0-0 of 0".to_string(),
                    },
                };
            }

            let a = start_line.unwrap_or(1).clamp(1, total);
            let b = end_line.unwrap_or(total).clamp(a, total);

            let slice = &all_lines[(a - 1) as usize..b as usize];
            let full_text = slice.join("\n");

            let (text, cut_note) = if slice[0].len() > limit {
                // One line over the limit (a minified file): cut the line itself.
                let first = slice[0];
                let read_on = if a < total {
                    format!("; read on with start_line={}", a + 1)
                } else {
                    String::new()
                };
                let note = format!("\n[line {a} is too long and was cut{read_on}]");
                (first[..first.floor_char_boundary(limit)].to_string(), Some(note))
            } else if full_text.len() > limit {
                let mut acc = String::new();
                let mut k = a;
                for (idx, line) in slice.iter().enumerate() {
                    let line_len = line.len() + if idx > 0 { 1 } else { 0 };
                    if acc.len() + line_len > limit && idx > 0 {
                        break;
                    }
                    if idx > 0 {
                        acc.push('\n');
                    }
                    acc.push_str(line);
                    k = a + idx as u32;
                }
                let note = format!("\n[cut at line {k}; read on with start_line={}]", k + 1);
                (acc, Some(note))
            } else {
                (full_text, None)
            };

            let for_model = match cut_note {
                Some(note) => format!("{path}, lines {a}-{b} of {total}:\n{text}{note}"),
                None => format!("{path}, lines {a}-{b} of {total}:\n{text}"),
            };
            let summary = format!("lines {a}-{b} of {total}");

            ToolRun {
                for_model,
                is_error: false,
                outcome: ToolOutcome::Ok { summary },
            }
        }
        Err(err) => refused(&err, path),
    }
}

pub fn search(root: &Path, query: &str, path: &str) -> ToolRun {
    if query.is_empty() {
        let for_model = "The search query is empty.".to_string();
        return ToolRun {
            outcome: ToolOutcome::Error {
                message: for_model.clone(),
            },
            is_error: true,
            for_model,
        };
    }

    match ws_search::search(root, path, query, SEARCH_LIMIT) {
        Ok((matches, cut)) => {
            let count = matches.len();
            if count == 0 && !cut {
                return ToolRun {
                    for_model: "No matches.".to_string(),
                    is_error: false,
                    outcome: ToolOutcome::Ok {
                        summary: "0 matches".to_string(),
                    },
                };
            }

            let mut lines: Vec<String> = matches
                .into_iter()
                .map(|m| format!("{}:{}: {}", m.path, m.line, m.text))
                .collect();

            if cut {
                if count >= SEARCH_LIMIT {
                    lines.push("(stopped at 100 matches)".to_string());
                } else {
                    lines.push("(stopped after 20,000 files)".to_string());
                }
            }

            let summary = format!("{count} matches");
            ToolRun {
                for_model: lines.join("\n"),
                is_error: false,
                outcome: ToolOutcome::Ok { summary },
            }
        }
        Err(err) => refused(&err, path),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Edit {
    pub path: String,
    pub before: String,
    pub after: String,
    pub line_ending: LineEnding,
    pub has_bom: bool,
    pub version: String,
}

pub fn prepare_edit(
    root: &Path,
    path: &str,
    old_text: &str,
    new_text: &str,
) -> Result<Edit, ToolRun> {
    if is_secret(path) {
        return Err(secret_refused(path));
    }

    let old_norm = old_text.replace("\r\n", "\n");
    let new_norm = new_text.replace("\r\n", "\n");

    let file = files::read_file(root, path).map_err(|e| refused(&e, path))?;
    if file.is_secret {
        return Err(secret_refused(path));
    }

    let count = if old_norm.is_empty() {
        0
    } else {
        file.text.match_indices(&old_norm).count()
    };

    if count == 0 {
        let for_model = format!(
            "old_text was not found in {path}. Read the file again and copy the text exactly."
        );
        return Err(ToolRun {
            outcome: ToolOutcome::Error {
                message: for_model.clone(),
            },
            is_error: true,
            for_model,
        });
    }

    if count > 1 {
        let for_model = format!(
            "old_text appears {count} times in {path}. Include more surrounding lines so it appears once."
        );
        return Err(ToolRun {
            outcome: ToolOutcome::Error {
                message: for_model.clone(),
            },
            is_error: true,
            for_model,
        });
    }

    let before = file.text.clone();
    let after = file.text.replacen(&old_norm, &new_norm, 1);

    Ok(Edit {
        path: path.to_string(),
        before,
        after,
        line_ending: file.line_ending,
        has_bom: file.has_bom,
        version: file.version,
    })
}

pub fn apply_edit(root: &Path, edit: &Edit) -> ToolRun {
    let req = files::WriteFile {
        path: edit.path.clone(),
        text: edit.after.clone(),
        line_ending: edit.line_ending,
        has_bom: edit.has_bom,
        expected_version: Some(edit.version.clone()),
    };
    match files::write_file(root, req) {
        Ok(_) => ToolRun {
            for_model: format!("The user accepted the change; {} was written.", edit.path),
            is_error: false,
            outcome: ToolOutcome::Ok {
                summary: "written".to_string(),
            },
        },
        Err(err) => refused(&err, &edit.path),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewFile {
    pub path: String,
    pub text: String,
}

/// Secret-looking names may be created: the user sees the content, and nothing is read.
pub fn prepare_create(root: &Path, path: &str, text: &str) -> Result<NewFile, ToolRun> {
    paths::resolve_new(root, path).map_err(|e| refused(&e, path))?;

    Ok(NewFile {
        path: path.to_string(),
        text: text.to_string(),
    })
}

pub fn apply_create(root: &Path, file: &NewFile) -> ToolRun {
    match files::create_file(root, &file.path, &file.text) {
        Ok(_) => ToolRun {
            for_model: format!("The user accepted; {} was created.", file.path),
            is_error: false,
            outcome: ToolOutcome::Ok {
                summary: "created".to_string(),
            },
        },
        Err(err) => refused(&err, &file.path),
    }
}

pub fn declined(is_command: bool) -> ToolRun {
    let for_model = if is_command {
        "The user denied this command. Do not run it again unless they ask.".to_string()
    } else {
        "The user rejected this change. Ask them what to do instead of retrying it.".to_string()
    };

    ToolRun {
        for_model,
        is_error: false,
        outcome: ToolOutcome::Declined,
    }
}
