# 2026-11-11 · M6 · Outside tools are already running
Agent: Claude Code (Opus 5.5)
Task: Live run hung on `node mcp-test.js`; the human asked why
Cause: prompt "install the Playwright MCP properly & test it"; qwen-3.8-27b installed @playwright/mcp + the MCP SDK in the folder and wrote a client with `--port 3001` (HTTP transport), so the stdio connect never answered. The 25 browser tools were connected but unused.
Changed: `tools/mod.rs` OUTSIDE_TOOLS_NOTE: tools are already running, never install/configure/script an MCP server; "Each call asks the user first" → "The user may be asked before each call" (decision 0029 made the old line untrue)
Docs: CHANGELOG (Fixed), known-issues entry
Tests: `system_prompt_note` extended (failed first).
Next: commit with the other three uncommitted M6 changes; human re-tries with "test the page at http://localhost:3000 with the browser tools".
