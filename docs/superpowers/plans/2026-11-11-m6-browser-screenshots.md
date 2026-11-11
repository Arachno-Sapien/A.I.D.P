# Screenshots on browser cards (M6)

The human chose on 2026-11-11: visible browser window now (done), screenshots on the browser cards later, as their own task. This is that task.

Goal: a `browser_take_screenshot` card shows the image; a vision model (capability **yes**) receives it; any other model gets text only.

## Choices (decision 0031)

- Images reach the model only when `supports_vision` is `Some(true)`. Unknown (every cloud model today) counts as no: a provider that can't read images refuses the whole request.
- Images ride on `ToolRound.images`, not on each `ToolOutput`. Each adapter adds them after the round's tool results: OpenAI-compatible and Ollama as a user message (tool messages there take text only), Anthropic as image blocks after the `tool_result` blocks of the same user message.
- Only the latest round keeps its images in later requests, so 20 screenshots don't ride on every request (older rounds keep the `[image image/png]` text).
- An image is checked like an attachment: base64 that decodes, PNG/JPEG/GIF/WebP by its first bytes (`attachments::detect`), at most `MAX_IMAGE` (5 MB). The declared MIME type is not trusted. Anything else stays a `[image ..., not shown]` line.
- The card always shows the image. Saved chats drop the image data (the card keeps its text), so `aidp.db` doesn't grow by a screenshot each time.
- Preset: `--image-responses allow` (0.0.85 accepts allow, omit, only).

## Files

| Step | Files |
| --- | --- |
| 1 MCP images | `src-tauri/src/mcp/client.rs` (`CallResult.images`, `flatten` returns text and images) |
| 2 Types | `src-tauri/src/gateway/mod.rs` (`ImageInput` serializable, `ToolRound.images`), `src-tauri/src/tools/mod.rs` (`ToolOutcome::Text.images`) |
| 3 Agent | `src-tauri/src/tools/agent.rs` (`AgentRun.vision`), `src-tauri/src/commands/chat.rs`, `src-tauri/tests/agent.rs` |
| 4 Adapters | `gateway/openai_compat.rs`, `gateway/anthropic.rs`, `gateway/ollama_chat.rs`; tests in `tests/openai_compat.rs`, `tests/anthropic.rs`, `tests/ollama_chat.rs` |
| 5 UI | `src/features/workspace/ToolStepView.tsx`, `src/features/chat/persist.ts`, their tests, `src/lib/bindings.ts` (generated) |
| 6 Preset and docs | `src/features/settings/OutsideTools.tsx` + test, decisions 0027 and 0031, `docs/security.md`, `docs/user-guide.md`, `CHANGELOG.md`, `.ai/memory/` |

Gate after each step that compiles: clippy -D warnings, cargo test, npm run typecheck, npx vitest run.
