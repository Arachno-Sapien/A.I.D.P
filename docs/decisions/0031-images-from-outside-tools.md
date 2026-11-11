# Decision Record 0031: Images from outside tools

**Date:** 2026-11-11
**Status:** Accepted (the human chose on 2026-11-11 "visible window now, screenshots on the browser cards later, as their own task")

## Context

Decision 0027 (D5) ran the Browser checks preset with `--image-responses omit`, so a `browser_take_screenshot` call gave the model and the user only a line of text. The human wanted to see what the agent saw, and vision models can check a page's layout from a screenshot. Images already reach models as chat attachments (decision 0019), with a per-model vision flag that only Ollama fills in (`/api/show`); cloud models stay unknown.

## Options considered

1. **Keep omitting images.** Nothing to build. The user and the model never see the page.
2. **Show images on the card only.** The user sees the page; the model still doesn't.
3. **Card for everyone, model only when its vision flag is yes (chosen).** Unknown counts as no, because a provider that can't read images refuses the whole request, which would break every browser run on a text-only model.

## Decision

- The preset uses `--image-responses allow`.
- `mcp/client.rs` keeps an MCP `image` item only when its base64 decodes to PNG, JPEG, GIF or WebP bytes of at most 5 MB (`attachments::detect`, `MAX_IMAGE`). The type comes from the bytes, not from the server's `mimeType`. Its text keeps an `[image image/png]` line; anything else stays `[image ..., not shown]`.
- The card (`ToolOutcome::Text.images`) always shows the images.
- `AgentRun.vision` is true only when `supports_vision` is `Some(true)`. Then a round's images ride on `ToolRound.images`: OpenAI-compatible and Ollama get them in a user message after the round's tool messages (their tool messages take text only), Anthropic as image blocks after the `tool_result` blocks of the same user message. Otherwise the tool's text says the images were not sent.
- Only the newest round with images keeps them in later requests; older rounds keep their text lines, so a long run doesn't resend every screenshot.
- Saved chats drop the image data (`persist.ts`), so `aidp.db` doesn't grow by a screenshot per call. A reopened chat shows the card's text only.

## Consequences

- A cloud model gets images only after the user sets **Reads images** to Yes for it on the Models screen (`set_model_vision`, added 2026-11-11); until then it is unknown and gets text only. Choosing models again keeps the answer, and Ollama models keep the flag Ollama reports. Image attachments follow the same flag: No refuses them before sending.
- An image is untrusted data like any tool result (outside-tool rule 3): text inside a screenshot never skips an approval.
- A server added from the old preset keeps `--image-responses omit` until the user edits its command or adds it again.
