# Decision Record 0027: Browser Checks Preset (`@playwright/mcp`)

**Date:** 2026-11-10
**Status:** Accepted (D5, D6 defaults approved on 2026-11-10); D5 replaced by decision 0031 on 2026-11-11

---

## Context

A.I.D.P needs a practical way for the Workspace agent to verify locally running web applications in a real browser without bundling a browser engine or adding bespoke browser-control Rust code. Two choices shape the Playwright MCP preset: whether screenshots are included in tool outputs (D5), and which origins the preset browser may navigate to (D6).

## Options considered

**Images / screenshots (D5)**
1. **Return screenshots to the model or UI.** Requires forwarding binary image tool results through all three model adapters (`openai_compat`, `anthropic`, `ollama_chat`) and validating per-model vision support inside tool loops.
2. **Text snapshots only (`--image-responses omit`, chosen).** The model inspects accessibility snapshots, page titles, console errors, and network info as text without image plumbing in tool results.

**Allowed origins (D6)**
1. **Open browsing (no origin flag).** Lets any prompt-injected text inside a repository steer the agent to arbitrary external websites.
2. **Localhost / loopback only (`--allowed-origins "http://localhost:*;http://127.0.0.1:*"`, chosen).** Keeps the preset scoped to local development servers, while explicitly documenting Playwright's own note that origin flags are convenience scoping rather than a hard security sandbox.

## Decision

Ship no browser-specific Rust code; instead provide a one-click **Fill in Browser checks (Playwright)** preset button in Settings → Outside tools (MCP) that populates the form (user still clicks Add):

- **Name:** `browser`
- **Command:** `npx -y @playwright/mcp@0.0.85 --isolated --image-responses allow --allowed-origins "http://localhost:*;http://127.0.0.1:*"`

The UI notes that Node.js 18+ is required, `@playwright/mcp` is downloaded on first start, and the user may be prompted to install a browser if Playwright's browser is not yet present.

## Consequences

- 2026-11-11: `--headless` dropped so the user watches the browser in its own window (the human's choice); add it back to hide the window.
- 2026-11-11: D5 replaced by decision 0031: `--image-responses allow`; screenshots show on their cards and reach models whose vision flag is yes.

- Keeps the installer size unchanged (Playwright is not bundled).
- Works across all tool-calling models: a model without vision gets the screenshot's text line only (decision 0031).
- Opening remote origins requires editing or removing `--allowed-origins` in the user's server entry.
