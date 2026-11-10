# Decision Record 0026: Hand-Written MCP Client, stdio Only, No Tokens

**Date:** 2026-11-10
**Status:** Accepted (D2, D3, D4 defaults approved on 2026-11-10)

---

## Context

Adding MCP outside tools requires choosing how A.I.D.P speaks MCP (D2), which transports to support (D3), and how to handle servers that need API tokens or environment secrets (D4).

## Options considered

**Client implementation (D2)**
1. **`rmcp` SDK crate.** Adds an external dependency tree, version lock-in, and potential feature interactions (such as TLS unification seen earlier in `known-issues.md`).
2. **Hand-written stdio JSON-RPC 2.0 client (~300 lines, chosen).** Built directly on `tokio` (`process`, `io-util`, `sync`, `time`) and `serde_json` already in `Cargo.toml`. Zero new Rust dependencies, total control over line limits (`MAX_LINE_BYTES = 8 MB`), non-JSON startup noise filtering, cancellation notifications, process-tree cleanup, and `stderr` tail capture.

**Transports (D3)**
1. **stdio + Streamable HTTP / SSE.** Brings remote server URL validation, HTTPS enforcement, TLS configuration, and auth headers immediately.
2. **stdio only (chosen).** Zero network listeners, zero outbound HTTP paths added for tools, aligns with running local developer sidecars (like `@playwright/mcp`).

**Server secrets / tokens (D4)**
1. **Keychain-backed environment variables in v0.1.** Requires per-server secret inputs, storage entries, and `secrets.rs` changes.
2. **Inherited environment only for now (chosen).** Servers inherit the app's standard environment. Settings states clearly that command lines are saved in SQLite as plain text and users must not paste tokens into commands. Keychain-backed env vars remain a separate future task touching `secrets.rs`.

## Decision

- Implement a small, auditable hand-written MCP JSON-RPC client in `src-tauri/src/mcp/` using only existing crates (`tokio`, `serde_json`), accepting protocol versions `"2025-06-18"`, `"2025-03-26"`, and `"2024-11-05"`.
- Support **stdio** child processes only (`cmd.exe /D /S /C` on Windows with a `Job` object; `sh -c` process group on Unix).
- Do not bundle an MCP secret store yet; warn users against putting tokens in command strings.

## Consequences

- Zero new Cargo dependencies, no change to `secrets.rs`, and full deterministic control over timeouts, cancellations (`notifications/cancelled`), oversized lines, and Windows job-object termination.
- Remote HTTP/SSE MCP servers and servers requiring managed API tokens wait for a dedicated follow-up decision.
