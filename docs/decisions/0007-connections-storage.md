# Decision Record 0007: Connections and Credential Storage Architecture

**Date:** 2026-10-30
**Status:** Accepted

---

## Context

In Milestone 2 (Keys and Providers), the application transitions from M1's temporary static configuration file (`config.local.json`) to dynamic, user-managed connections for multiple cloud providers (OpenAI, OpenRouter, Groq, DeepSeek, Gemini, Anthropic, and custom endpoints).

The storage architecture must satisfy strict security and reliability criteria:
1. **Zero plain-text key exposure:** API keys must never be written to disk in plain text or stored in application database tables.
2. **Deterministic testing:** Tests must not mutate the developer's real Windows Credential Manager or fail on headless CI runners where OS credential daemons are absent.
3. **Data integrity:** Removing a connection must atomically clean up associated models and credentials.
4. **Type-safe IPC:** Data types must cross the Tauri IPC boundary to TypeScript without serialization errors or precision loss.

---

## Options Considered

### 1. Keychain Access: Direct `keyring` vs. `SecretStore` Trait
- **Direct `keyring` crate calls:**
  - *Pros:* Simpler initial code; fewer layers of abstraction.
  - *Cons:* Unit and integration tests would execute against the real operating system keychain, modifying developer credentials, requiring interactive authentication prompts, or failing completely on headless Linux CI runners without GNOME Keyring.
- **`SecretStore` Trait (`Keychain` + `MemoryStore`):**
  - *Pros:* Fully decouples the security boundary from the operating system implementation. Production uses `Keychain` (calling `keyring` 4.2 with OS-native credential storage), while unit and adapter tests use `MemoryStore` for hermetic, fast test execution.
  - *Cons:* Small trait wrapper in `src-tauri/src/secrets.rs`.

### 2. Connection Metadata: JSON File vs. SQLite Database
- **JSON configuration file:**
  - *Pros:* Human-readable; easy to inspect manually.
  - *Cons:* Vulnerable to race conditions and file corruption on unexpected crashes; no foreign key constraints or cascading deletes; difficult schema migration handling.
- **Embedded SQLite via `rusqlite` (`bundled`):**
  - *Pros:* ACID transactions; relational constraints (`ON DELETE CASCADE` ensures deleting a connection cleans up its models); numbered migrations via `PRAGMA user_version`; bundled C source avoids external system dependencies on Windows.
  - *Cons:* Binary format requires SQLite tooling to inspect outside the app.

### 3. Record Identifiers & Timestamps: `i64` vs. `u32` vs. UUID strings
- **`i64` (Standard SQLite rowid):**
  - *Cons:* `tauri-specta` explicitly rejects 64-bit integers (`i64`/`u64`) because JavaScript engines represent them as `BigInt`, which standard JSON serialization cannot handle without precision loss.
- **UUID strings:**
  - *Cons:* Larger storage overhead, heavier indexing, unnecessary complexity for local-only records.
- **`u32` (Unsigned 32-bit integer):**
  - *Pros:* Maps directly to TypeScript `number` without precision loss; supports over 4.2 billion records; timestamps as epoch seconds are valid until February 2106.

---

## Decision

1. **`SecretStore` Trait:** Implemented `SecretStore` in `src-tauri/src/secrets.rs`. The production app uses `Keychain`, storing credentials under service `com.aidp.desktop` and username `connection-{id}`. Tests use `MemoryStore`.
2. **SQLite (`aidp.db`):** Used `rusqlite` with the `bundled` feature. Schema migrations are managed via sequential integer versions with `PRAGMA user_version`. The database stores metadata and a 4-character `key_hint` only.
3. **`u32` IDs and Timestamps:** All database row IDs, foreign keys, and epoch timestamps crossing IPC are typed as `u32`.
