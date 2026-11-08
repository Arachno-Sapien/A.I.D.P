# 2026-11-09 · M6 · Recycle Bin path guard
Agent: Claude Code (Opus 5.5)
Task: a second automated security review, of 80c1d7e: "path normalization differential (incomplete fix)"
Finding: real. `check_components` checks the names typed, but `resolve` canonicalizes the folder part, following links: a symlink `lnk` → `\\?\...\weird.` gives `\\?\...\weird.\f.txt`, and the plain path the Recycle Bin gets is `...\weird\f.txt`, another file. The opened folder's own path could hold such a name too
Fix: `files::shell_path` makes the plain path and refuses it if any name in it ends in `.` or space (Windows); `to_trash` uses it, so the check is at the one place a checked `\\?\` path becomes a plain one. Other plain paths (`display_path` in mod.rs, agent.rs, pty.rs) are only the opened folder, picked by the user
Tests: `shell_path_drops_the_prefix_and_refuses_names_windows_would_change` (unit), `a_link_to_a_trailing_dot_folder_never_reaches_the_recycle_bin` (symlink_dir, Windows; `mklink /J` drops the dot, so the first try didn't build the case). 260 Rust, 331 Vitest, clippy and typecheck clean
Changed: src-tauri/src/workspace/files.rs, src-tauri/tests/workspace.rs, docs/security.md, known-issues
Next: unchanged (the human tries the tree actions in the app)
