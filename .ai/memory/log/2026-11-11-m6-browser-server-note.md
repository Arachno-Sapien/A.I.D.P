# 2026-11-11 · M6 · Browser checks: agent looped starting a server
Agent: Claude Code (Opus 5.5)
Task: The human's live Browser checks run (qwen-3.8-27b, Review at end on) used all 25 steps; fix it
Cause: every model command runs in a job object that kills its whole tree when it ends, so `python -m http.server`, `start /B` and `Start-Process` servers all died (one showed LISTENING inside the command, refused right after). The model was never told; the user guide was.
Changed: `src-tauri/src/tools/mod.rs` (`OUTSIDE_TOOLS_NOTE`: commands' processes end with them; ask the user to start the server in the workspace terminal and wait; file: is blocked), test `system_prompt_note`; `docs/user-guide.md` troubleshooting row; CHANGELOG; known-issues.
Decisions: no change to the job object (workspace rule 4). Agent-started long-lived servers would need a decision record.
Tests: `system_prompt_note` failed first, then passed; clippy clean; cargo test 304 passed; typecheck clean; vitest 366 passed.
Second run: the human asked the agent to "Start server & test", so it tried again; after ~10 min of timeouts the 10-min idle stop killed the browser server mid-run ("no such tool"). Added `Hub::hold` (held servers skip the idle stop), held per agent run; 2 new tests pass. Full gate green after the app restart: clippy clean, cargo test 306, typecheck clean, vitest 366. Uncommitted.
Next: the human re-runs Browser checks with the server started in the terminal panel.
