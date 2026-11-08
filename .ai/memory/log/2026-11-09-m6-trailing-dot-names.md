# 2026-11-09 · M6 · Names Windows would change
Agent: Claude Code (Opus 5.5)
Task: an automated security review of commit 1110965 (rename, move, delete): "path validation differential (verbatim vs Win32 normalization)" in `to_trash`
Finding: real. `\\?\` paths keep trailing dots and spaces; `to_trash` passes `display_path` (no `\\?\`) to the shell, which drops them. A file named `...` checks as itself but trashes the folder it is in; `notes.` trashes `notes`. The agent's `create_file` could make such names. New test `names_windows_would_change_are_refused` reproduced it: `delete_entry("sub/...")` reached put-away
Fix: `paths::check_components` refuses, on Windows, any name ending in `.` or space (`OutsideFolder`), so resolve, resolve_new and resolve_entry all refuse it: no reading, making, renaming, moving or deleting such a name. Not on macOS or Linux, where the names are ordinary
Changed: src-tauri/src/workspace/paths.rs; src-tauri/tests/workspace.rs (1 test, Windows only); docs/security.md; known-issues
Tests: 258 Rust (1 new on Windows), 331 Vitest, clippy and typecheck clean
Next: unchanged (the human tries the tree actions in the app)
