# 2026-10-30 · M2 · review of Tasks 1 to 5, and fixes
Agent: Claude Code (Opus 5.5)
Task: Review Gemini's M2 Tasks 1 to 5 against the plan; fix what the review found
Checked: gate re-run (clippy, 73 Rust tests + 1 ignored, vitest 20, typecheck, bindings unchanged); real Credential Manager round trip passes; all planned test names present; keyring only in secrets.rs; expose_secret only in the adapters and secrets.rs; no logging; no key-like strings in git history; no capability or tauri.conf change
Changed: src-tauri/src/gateway/anthropic.rs, src-tauri/src/connections.rs, src-tauri/tests/anthropic.rs, src-tauri/tests/connections.rs, docs/phases/M2.md, the M2 plan's status line, progress.md, known-issues.md
Fixes: Anthropic key header marked sensitive (key_header); closed channel -> Cancelled; error body read honours Stop; non-JSON stream data -> "could not read" error (valid JSON of unknown shape still skipped); keys trimmed before test and save (plan gap); DB-canary test uses a unique temp folder
Tests: 3 added (malformed_event_is_an_error, closed_channel_stops_the_stream, keys_are_trimmed_before_saving), each seen failing first
Problems: Gemini's ignores_unknown_events test sends an event without "type"; a strict parse broke it, so only non-JSON data is an error
Not done: cargo fmt drift (37 hunks, M0 to M2 files; not in the gate) left for a formatting-only commit
Next: Task 6 (commands, app state, chat rewrite; delete the config path), committed together with Tasks 7 and 8
