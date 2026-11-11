# 2026-11-11 · M6 · Screenshots on browser cards
Agent: Claude Code (Opus 5.5), a side session started by the main session
Task: The human's "screenshots on the browser cards later, as their own task": show MCP images on cards and pass them to vision models. Plan: docs/superpowers/plans/2026-11-11-m6-browser-screenshots.md
Changed: mcp/client.rs (`CallResult.images`; `flatten` returns text + images checked by `attachments::detect`, 5 MB, type from bytes), gateway/mod.rs (`ImageInput` serializable, `ToolRound.images`, `TOOL_IMAGES_NOTE`), tools/mod.rs (`ToolOutcome::Text.images`, serde default), tools/agent.rs (`AgentRun.vision`, `IMAGES_NOT_SENT`, only the newest round keeps images), commands/chat.rs (vision = `supports_vision == Some(true)`), the three adapters (images after the round's results: user message for OpenAI-compatible and Ollama, image blocks after tool_result for Anthropic), ToolStepView.tsx (img per image), persist.ts (saved chats drop images), OutsideTools.tsx preset `--image-responses allow`, bindings
Decisions: 0031; 0027 D5 replaced. Unknown vision (every cloud model) = no images, since a provider without vision refuses the request
Docs: security.md §13, user guide Browser checks, CHANGELOG
Tests: client flatten (bad base64, SVG, declared-vs-real type), one round-image test per adapter (wiremock), agent vision/no-vision with the fake MCP server (`echo` with `png: true`), card img, persist strip. Adapter and agent tests were written before the code but compiled with it, so not seen failing. Gate: clippy clean, rust 322, typecheck clean, vitest 381
Problems: bash heredoc turned `\n` in a TS string into a newline again (known issue); Python string patches failed on a match, Edit tool worked
Not checked live: a real browser_take_screenshot in the app, with a vision Ollama model and with a cloud model
Next: live check; follow-up: a way to mark a cloud model as vision so Claude/GPT get screenshots
