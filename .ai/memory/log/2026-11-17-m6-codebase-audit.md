# 2026-11-17 · M6 · whole-codebase audit and fixes
Agent: Claude Code (Fable 5.2, then Opus 5.5), with workflow subagents
Task: the human's "analyse the full codebase, fix functional, structural and security issues, optimize; check Settings MCP and Commands that run without asking; move Updates to the bottom", then "commit & push once the fixes are done"
Settings: Updates last; MCP row layout and hint; allowed commands wrap; keep-loaded aria-pressed. Checked in a browser with stubbed IPC at 1024×768 and 720×480.
Audit: 10 read-only finders by subsystem, 2 verifiers per finding: 43 confirmed, 5 disputed, 1 rejected (already fixed). Fixed in 5 worktree branches (merged), plus by the lead:
- Security: same-origin redirects only (`gateway::http::client`, used by lib.rs); GIT~1 and Windows device names refused (workspace/paths.rs, mcp server names); hub "off" set, calls by server id, one start per id, Test stops an off server it spawned even when a run holds it (security hook finding); CI read-only token and pinned actions.
- Functional: Always allow waits for the save; Stop registered before attachments load (commands/chat.rs, no unit test: needs Tauri State); prompt and tool texts no longer promise approval; chat/workspace store races (send, acceptProposal, reloadIfClean, streaming flag); pull-cancel slot by id; update timeouts; settings/models error states; Unix process-group cleanup.
- Perf: attachments_in_use single pass, PDFs not re-read, search lowercases once, store selectors, AI panel no full-text copies.
Not done (left open): c12 PDF child memory cap (needs the Job helper in tools/command.rs and setrlimit on Unix); c37 agent step deep-clones the conversation (not assigned); delete_conversation clean-up off the main thread; picker select() save error not shown; Download re-enabled a moment early after Cancel (Rust answers honestly); d2 include_usage, d3 cancellable Test, d4 thin ollama commands; agent.rs repetition.
Tests: gate green: clippy clean, rust 348 (2 new Unix-only tests run only in CI), typecheck, vitest 408. Every behaviour fix has a test seen failing first.
Problems: first audit run died on usage limits (resumed); 4 of 5 worktrees started at 36db1f5 (merged three-way, one test-file conflict kept both sides); GateGuard batch trap (known-issues).
Next: watch CI on three OSes for the Unix-only tests; try the fixes in `npm run tauri dev`.
