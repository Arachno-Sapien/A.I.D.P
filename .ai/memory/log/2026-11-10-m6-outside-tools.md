# 2026-11-10 · M6 · outside tools and browser checks
Agent: Antigravity (Gemini 3.1 Pro)
Task: Implement Tasks 0-7 of the outside tools (MCP) & Playwright browser checks plan inside M6
Changed: AGENTS.md, docs/design.md, docs/phases/M6.md, docs/decisions/0025-0027.md, docs/security.md, docs/user-guide.md, CHANGELOG.md, README.md, src-tauri/src/mcp/, src-tauri/src/db/mcp.rs, src-tauri/src/commands/mcp.rs, src-tauri/src/tools/{mod,run,command,agent}.rs, src-tauri/src/{lib,gateway/mod,commands/chat}.rs, src-tauri/tests/{mcp,agent,connections,tools,anthropic,ollama_chat,openai_compat,fixtures/fake-mcp.mjs}, src/features/workspace/{ToolStepView.tsx,ToolStepView.test.tsx}, src/features/settings/{OutsideTools.tsx,OutsideTools.test.tsx,SettingsScreen.tsx}, src/lib/bindings.ts
Decisions: D1 amended to M6 (0025); hand-written stdio MCP client (0026); Browser checks preset @playwright/mcp@0.0.85, no images, localhost origins (0027)
Hardening: write_all raced against timeout/cancel, notifications/cancelled bounded to 200 ms, MCP error strings capped with head(), enabled server check enforced before approval
Problems: Rust 2024 clippy collapsible_if & unwrap_used rules; App.test & SettingsScreen.test needed listMcpServers mock; ConfirmDialog portal for Glass backdrop-filter
Tests: cargo clippy clean, cargo test 301 passed (2 ignored), npm run typecheck clean, npx vitest run 47 files / 349 passed
Next: Human Task 8 live check in npm run tauri dev with Browser checks preset (@playwright/mcp@0.0.85) and Task Manager RAM measurement
