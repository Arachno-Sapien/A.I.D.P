# 2026-10-29 · M1 · review of Gemini's M1 work, fixes
Agent: Claude Code (Opus 5.5)
Task: Review the 9 M1 commits (ccb169d..848ae55) and fix the findings with tests
Changed: src/features/chat/store.ts (+test), src-tauri/src/gateway/openai_compat.rs (+test in tests/openai_compat.rs), src-tauri/src/config.rs (+test), src-tauri/src/commands/chat.rs, docs/phases/M1.md, .ai/memory/progress.md
Decisions:
- History skips messages with empty text. A reply stopped before its first token was sent as {role: assistant, content: ""}.
- An `error` object inside a 200 SSE stream becomes Provider { message }. Before the fix, the cut-off reply returned Ok.
- send_message calls ChatState::begin() before loading the config, so a Stop pressed during the load is not lost.
- check_base_url strips IPv6 brackets before parsing the IP. host_str() returns "[::1]", so the IPv6 local check never matched.
Problems:
- Earlier log 2026-10-29-m1-implementation.md says 19 Vitest tests; there were 18 (19 after this session's new test). It also had an uncommitted trailing blank line again, which was discarded.
- docs/phases/M1.md had all 4 boxes ticked before the live check; boxes 1 to 3 are unticked until the human confirms.
Tests: each new test failed first for the expected reason, then passed. Gate green: clippy; cargo test 17 unit + 9 integration; typecheck; vitest 19; bindings.ts unchanged.
Not covered by automated tests: Stop after text has started streaming; navigator.clipboard in WebView2. Both are in the human's live check.
Next: human live check (plan Task 7 step 4), then plan Task 8 (review and close M1).
