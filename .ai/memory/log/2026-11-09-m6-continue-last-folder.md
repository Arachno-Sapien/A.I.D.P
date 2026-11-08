# 2026-11-09 · M6 · Continue in the last folder
Agent: Claude Code (Opus 5.5)
Task: the human's "give the users the option to continue from the last open workspace's working directory"
Changed: src/features/workspace/WorkspaceScreen.tsx (no-folder screen: primary "Continue in <folder>" button with the full path for `recent[0]`, "Open folder" becomes secondary, Recent folders lists the rest; `folderName` for Windows and Unix paths); WorkspaceScreen.test.tsx (3 tests replace "opens a recent folder"); themes.test.ts (neutral-700 on neutral-100 readable in every theme); docs/user-guide.md; CHANGELOG [Unreleased]
Decisions: no Rust or new state; `recent_workspaces` is already newest first and persisted. Not done: reopening the folder by itself at start (would also raise idle RAM above the no-folder budget)
Problems: the path line was neutral-600 first; the new contrast check failed for Soft (4.13:1), so neutral-700
Baseline: `timeout_kills_the_whole_tree` failed once in the full suite before any change; passed 3/3 alone and in a full rerun (known-issues)
Tests: 274 Vitest (was 272), 248 Rust, clippy and typecheck clean
Not yet: seen in the app
Also: the human asked how to add squiggly error underlines; answered with options (parser syntax errors now, language servers later, no always-on AI). Their choice is pending
Next: the human checks the button in the dev app
