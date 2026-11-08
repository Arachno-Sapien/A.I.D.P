# Decision Record 0024: Rename, Move and Delete in the File Tree

**Date:** 2026-11-09
**Status:** Accepted (the human asked for rename, delete, a right-click menu and drag-to-move)

---

## Context

The file tree could open and create files, but not rename, move or delete them. Two choices had real alternatives: what Delete does to a file, and how dragging works inside a Tauri window.

## Options considered

**Delete**

1. Remove for good (`remove_file`, `remove_dir_all`). No new crate, but one wrong click loses work, and a folder outside git has no undo.
2. **The system's Recycle Bin or Trash**, through the `trash` crate (5.3, MIT). Restorable, as in VS Code and file managers. It uses the `windows` 0.62 and `objc2` 0.6 crates already in the build; the lockfile gains only `trash` and `urlencoding` (Linux).

**Dragging**

1. HTML drag-and-drop. Tauri's window takes drag-and-drop events for files dropped from the OS (attachments, decision 0019), so on Windows the page never sees `dragover` or `drop`. Turning that off would break dropping files into Chat.
2. **Mouse events**: press on a row, move 5 px, release over a folder.

## Decision

- Delete goes to the Recycle Bin or Trash (option 2), after a confirm dialog that says so. On macOS the crate's NSFileManager method is used, so there is no "control Finder" permission prompt. If the trash refuses (some network drives), the error shows and nothing is deleted.
- Dragging uses mouse events (option 2). A drop on a folder moves into it, on a file into that file's folder, below the rows to the top. Moving into the folder it's already in, or a folder into itself, does nothing.
- Rust: `rename_entry(from, to)` and `delete_entry(path)`. Both act on the entry itself (`paths::resolve_entry`): a link is renamed or deleted, never what it points to. The opened folder itself and `.git` are refused; the destination goes through `resolve_new`, so it stays inside the folder and never replaces another entry. A folder can't move into itself (`WorkspaceError::IntoItself`). A name that differs only in case renames in place on Windows and macOS.
- The UI refuses, before asking, to rename, move or delete anything with unsaved changes or a proposed AI change waiting for an answer. Tabs of renamed or moved files reopen at the new path; tabs of deleted files close.

## Consequences

- Deleted files can be restored from the Recycle Bin or Trash. Tests pass their own "put away" function, so the test suite never fills the real trash; one ignored test (`to_trash_really_moves_a_file_to_the_trash`) uses the real one when run by name.
- Dropping files from the OS into the window keeps working.
- No undo inside the app yet; restoring a deleted file is done from the system's Recycle Bin or Trash.
