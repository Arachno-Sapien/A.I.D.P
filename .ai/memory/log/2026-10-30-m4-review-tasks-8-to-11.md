# 2026-10-30 · M4 · review and fixes for Tasks 8 to 11
Agent: Claude Code (Opus 5.5)
Task: Review Antigravity's Tasks 8 to 11 against the plan; fix the findings (human: "Yes, fix here")
Review: gate green on HEAD (165 Rust, 149 vitest); every planned test present; approvals answer only, Rust writes; no boxes ticked
Changed:
- tools/run.rs parse: run_command refuses controls (tab and line breaks allowed), bidi overrides and isolates, zero-width and other invisible format characters, so the approval card shows what runs (test command_with_hidden_characters_is_refused)
- workspace/TerminalPanel.tsx: events from a replaced channel are ignored; terminalOpen and terminalClose run one after another. StrictMode opened two shells in dev and the discarded one's output, "[process exited]" and Restart reached the live terminal (probe confirmed; tests "ignores a replaced shell", "opens and closes one after another")
- workspace/ToolStepView.tsx: a missing exit code reads "Exit code unknown", not "Exit code 0"
- docs/phases/M4.md: supports_tools is INTEGER, no Models-page control, workspace/search.rs; docs/security.md: the command character check
Problems: Antigravity still had uncommitted edits in the shared checkout; worked in ../aidp-fix (branch m4-review2) and merged
Not changed: Ctrl+\ shortcut and drag-resize (extras beyond the plan, harmless)
Next: Task 12 (human live check, RAM, close)
