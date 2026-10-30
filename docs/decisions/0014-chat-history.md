# Decision Record 0014: Chat history persistence and per-folder workspace conversations

**Date:** 2026-10-30
**Status:** Accepted (the human approved default D3 on 2026-10-30)

---

## Context

Conversations in Chat and the coding workspace previously disappeared on app restart or folder reload. M5 introduces persistent history stored in the local SQLite database (`aidp.db`).

We need a clean storage model that records conversation metadata, message roles, model provenance, and rich UI state (attached file chips, diff proposals, agent tool calls, thinking blocks) without streaming disk overhead.

## Options considered

1. **Stream-level persistence from Rust.** Rust writes each token delta and state event to SQLite as it arrives over the HTTP connection. High write frequency, complex rollback on cancelled streams, and redundant serialization.
2. **UI-driven persistence with SQLite migration 4 (chosen).** The UI sends complete messages: user prompt on send, and assistant message upon completion (`done`), stop (`stopped`), or error (`error`).

## Decision

Option 2 (default D3).

- **Schema (migration 4):**
  - `conversations`: `id`, `title`, `workspace_path` (nullable), `created_at`, `updated_at`.
  - `messages`: `id`, `conversation_id`, `role`, `content_parts`, `model_name`, `model_ref`, `tokens_in`, `tokens_out`, `status`, `error_kind`, `created_at`.
- **Surfaces & Scopes:**
  - Chat conversations have `workspace_path IS NULL`. A filterable sidebar lists all chat conversations, allows creating new chats, and allows deleting chats with inline confirmation.
  - Workspace folders have `workspace_path = <folder_path>`. A folder keeps its own single ongoing conversation, restored whenever that folder is opened.
- **Envelope format:** UI state is saved in `content_parts` as a versioned JSON envelope (`{ v: 1, text, content, chips, target, parts }`). If deserialization encounters plain text or malformed JSON, it falls back cleanly to plain text.
- **Security:** Model responses are stored unencrypted in local SQLite. Attached secret files are prevented from reaching context by workspace rules; normal file attachments are saved in history as user context.
