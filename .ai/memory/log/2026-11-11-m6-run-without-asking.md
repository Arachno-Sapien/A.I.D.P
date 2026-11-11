# 2026-11-11 · M6 · Run without asking for an outside server
Agent: Claude Code (Opus 5.5)
Task: The human asked for an auto-approve mode after a browser run with a Run/Deny card per click; chose "Per-server setting" over per-task trust, per-task commands, or no change
Changed: `db/mod.rs` (migration 8: `mcp_servers.auto_approve` default 0), `db/mcp.rs` (`set_auto_approve`), `mcp/mod.rs` (`ServerConfig.auto_approve`, `Services::set_mcp_server_auto_approve`), `commands/mcp.rs` + `lib.rs` (`set_mcp_server_auto_approve`), `tools/agent.rs` (no register/wait for such a server; card sent with `needs_answer: false`), `OutsideTools.tsx` (switch; turning on asks first), bindings
Docs: decision 0029; outside-tool rule 2 and the "Never" line amended in AGENTS.md, design.md, security.md; user guide, README, CHANGELOG
Decisions: setting read when a run starts (change applies from the next task; Stop ends a run). Model commands keep asking, no exception.
Tests: `run_without_asking_server_skips_the_card` (failed first: run waited for approval), db round trip, Settings confirm test (failed first). clippy clean; cargo test 307; typecheck clean; vitest 367.
Next: commit (with the Browser checks fixes in the tree), then try it live with the browser preset.
