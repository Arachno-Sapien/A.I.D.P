# 2026-11-19 · M6 · audit follow-ups 1-5
Agent: Claude Code (Opus 5.5), with four worktree subagents
Task: the human's "Yea, go ahead" to the open audit items 1-5 (log/2026-11-17-m6-codebase-audit.md)
Changed:
- src/features/models/store.ts, chat/ModelPicker.tsx, models/LocalPanel.tsx: select() returns the save error; the picker shows it and restores the old model. cancelPull keeps the pull ("Cancelling…") until its own result; a sequence number stops a late result clearing a newer pull.
- src-tauri/src/commands/history.rs: delete_conversation is async; the attachment clean-up runs in spawn_blocking (bindings unchanged).
- src-tauri/src/gateway/openai_compat.rs: stream_options.include_usage on every stream; one retry without it on a 400/422 naming stream_options.
- src-tauri/src/mcp/hub.rs, commands/mcp.rs, lib.rs, bindings.ts, settings/OutsideTools.tsx: numbered cancel token per Test; cancel_mcp_test; stop() cancels a Test; the Test button becomes Cancel and shows "Test cancelled.".
Decisions: the usage retry is narrow (only errors naming stream_options), because all compatible providers share one ConnectionKind. Off and Remove stay disabled during a Test.
Tests: each fix has a test seen failing first, except the delete clean-up move (same service code, only the thread changes; the command needs Tauri State). Gate green: clippy clean, rust 356, typecheck, vitest 413.
Problems: none new; tools.rs process-kill tests flaked once in a worktree under load (known).
Still open: item 6 PDF child memory cap (waits for the human's answer on a libc dependency); items 7-9 (agent.rs repetition, thin ollama commands, shared ChatRequest parts).
Next: CI on three OSes, then try Test → Cancel and an OpenAI reply's token counts in `npm run tauri dev`.
Addendum (same day): item 6 done after the human's "okay, go ahead" to adding `libc`. Instead used no new dependency: `attachments::pdf::CappedAlloc` is the global allocator (main.rs); the `--pdf-text` child sets a 1 GB heap cap from its new `<bytes>` argument (missing or bad = 1 GB, never none). Reason: macOS doesn't enforce RLIMIT_AS, so setrlimit would have left it open. Tests: tests/pdf_child.rs (real child, 16 MB cap, 48 MB bomb fails, small PDF reads; seen failing first), allocator unit test. Gate green: rust 358, vitest 413.
