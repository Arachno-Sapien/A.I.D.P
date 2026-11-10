# 2026-11-10 · M6 · review of the outside-tools code, five fixes
Agent: Claude Code (Opus 5.5)
Task: The human asked for a bug review of Antigravity's MCP/Playwright work (commits 5933628..897a424), then "Yes, fix all five"
Read: mcp/{client,hub,mod}.rs, commands/mcp.rs, db/mcp.rs, the MCP branch of tools/agent.rs, OutsideTools.tsx, lib.rs wiring. Held up: every MCP call waits for approval in Rust; Stop and timeouts kill the tree; servers stop on app exit; 8 MB line cap before buffering; results capped at 20,000 chars.
Fixed, test-first (commit 1c90e61):
1. Remove/Off during a start: `Hub` counts stops per server id; a start that began before a stop kills its process and returns `Stopped` instead of adding it (before: it ran on for 10 min, and `call` finds servers by name, so a re-added server's calls could reach the old process). Test `stop_during_start_wins` (fake server mode `slowinit`); it failed against the old hub (`Ok(3)`).
2. Stop or timeout while a request is still being written closes the client (half a message may be in the stream), so the next run restarts the server. `stalled_write_respects_timeout_and_cancel` asserts `is_closed()`.
3. The agent asks only about MCP tools a started server offered this run (`specs_list[builtin_count..]`); anything else is "There is no tool named …" with no card. Test renamed `unknown_mcp_tool_is_never_put_to_the_user`.
4. Settings: the On switch and Remove are disabled while that server's Test is starting.
5. `stop_all` kills servers together (`futures_util::future::join_all`), so quitting waits for the slowest, not the sum. No test (timing only).
Not fixed, noted: Test can't be cancelled (up to 120 s start + 30 s list); `--allowed-origins "http://localhost:*;…"` still unverified (Task 8).
Problems: the first test run hung (the new agent test waited on an approval nobody answered, as expected before fix 3); stopped it by hand.
Tests: clippy clean; cargo test 304 passed; typecheck clean; vitest 49 files / 366 passed.
Next: Task 8 live check in `npm run tauri dev`, with Review at end.
