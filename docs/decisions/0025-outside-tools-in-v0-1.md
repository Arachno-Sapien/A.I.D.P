# Decision Record 0025: Outside Tools (MCP) in v0.1 (M6)

**Date:** 2026-11-10
**Status:** Accepted (defaults approved on 2026-11-10; D1 amended to "Now, inside M6" on 2026-11-10)

---

## Context

`AGENTS.md` and `docs/design.md` originally placed an MCP client and browser checks with Playwright under "Not in v1" / "Later" so v0.1 could focus on built-in workspace tools. With `0.1.0-rc.5` already released and working, the user asked to add outside tool support via MCP and Playwright browser checks now, inside M6, rather than deferring them to v0.2.

Two scope questions needed an explicit choice:
- **D1 (Timing):** wait until `0.1.0` ships and M6 closes as M7, or implement now inside M6 (`M6:` commits, no separate `M7.md` phase doc)?
- **D7 (Where outside tools are offered):** Workspace agent only (Agent switch on), or plain Chat as well?

## Options considered

1. **Wait for v0.2 (M7).** Keeps v0.1 frozen while closing M6, delaying outside tools until after the v0.1 release.
2. **Implement now inside M6 (chosen), Workspace only.** Adds MCP outside tools and the Playwright preset directly into M6 (`v0.1`), using the existing Workspace agent tool-call loop and approval gate.

For D7:
1. **Plain Chat + Workspace.** Plain Chat currently has no tool loop or approval UI; adding it would duplicate agent scaffolding.
2. **Workspace, Agent switch on (chosen).** Reuses `tools/agent.rs`, `Approvals`, `ToolStepView`, and the existing `ChatEvent::ToolCall` / `ToolResult` channel contract.

## Decision

- **D1:** Implement outside tools and browser checks **now inside M6** (`M6:` commit prefix, tracked in `docs/phases/M6.md`, no `docs/phases/M7.md`).
- **D7:** Offer outside tools only in the **Workspace** panel when **Agent** is turned on (for models with tool calling). Plain Chat remains tool-free in v0.1.
- **Security rules:** Six mandatory rules ("Outside tool security" in `docs/design.md` and `AGENTS.md` section 6) govern every MCP feature:
  1. The user adds every server by hand in Settings (never read `.mcp.json` or config from the opened folder; models cannot add, edit, or start disabled servers).
  2. Every call is approved in Rust (`Approvals`), showing server, tool name, and exact arguments with hidden characters escaped (`\u{XXXX}`); no auto-approve.
  3. Tool descriptions and results are untrusted data; prompts/pages inside them never bypass approval.
  4. Servers run outside the opened folder under `<app data>/mcp/<name>`, as the user; they start on demand when an agent run or manual Test runs, stop when disabled/deleted, stop on app exit, and stop after 10 idle minutes.
  5. Commands are stored in SQLite as plain text; Settings warns users not to put tokens in commands, and servers receive no secrets from the keychain.
  6. stdio only: no HTTP/SSE transport and no listening port in v0.1.

## Consequences

- Outside tool support moves out of "Not in v1" / "Later" into M6 (`v0.1`).
- Every MCP tool call pauses at an explicit approval card in Workspace before reaching the child process.
- Plain Chat tool support, project-local `.mcp.json`, and session auto-approve remain out of scope.
