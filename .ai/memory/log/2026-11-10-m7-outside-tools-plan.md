# 2026-11-10 · M7 (proposed) · plan for MCP client and browser checks
Agent: Claude Code (Fable 5.2)
Task: Write a plan any model can run for an MCP client and Playwright browser checks
Changed: docs/superpowers/plans/2026-11-10-m7-mcp-and-browser-checks.md (new), .ai/memory/progress.md
Code: none. Both features are "Not in v1" (AGENTS.md sections 2, 7); the plan's Task 0 is the human's go-ahead plus the rule changes.
Design in the plan:
- Hand-written MCP client over stdio in src-tauri/src/mcp/ (no new crate); Hub starts servers per agent run, stops them after 10 idle minutes.
- Tools named mcp__<server>__<tool>, added to the six built-in ones; every call through Approvals with the exact arguments shown.
- Servers only from Settings (table mcp_servers, migration 7); never from the opened folder.
- Browser checks = a preset command for @playwright/mcp (pinned 0.0.85, headless, isolated, images omitted, localhost only), not new Rust code.
Open for the human: D1–D7 in the plan (when, rmcp or by hand, stdio only, tokens, screenshots, localhost only, Workspace only).
Checked online 2026-11-10: MCP lifecycle (protocol 2025-06-18), Playwright MCP README flags, npm latest 0.0.85.
Not verified: whether --allowed-origins takes "http://localhost:*"; which browser Playwright MCP uses by default. Task 8 settles both in the live check.
Read for the plan: tools/{mod,agent,approvals,run,command}.rs, gateway/mod.rs, commands/{chat,tools,settings}.rs, lib.rs, secrets.rs, db/mod.rs (migrations), ToolStepView.tsx. Not read: connections.rs beyond its signatures, SettingsScreen.tsx beyond its headings, the three adapters' tool code.
Problems: GateGuard asks for facts before the first Bash and before each first Write or Edit of a file (known-issues, 2026-10-29).
Tests: none run (docs only).
Next: the human answers D1–D7; then Task 0.
