# Decision Record 0033: Per-model effort (thinking) levels

**Date:** 2026-11-21
**Status:** Accepted. The human reviewed the plan and replied "Subagent-driven" (2026-11-21) to "Does the plan capture what you want, and which approach should we use?", so the plan and decisions D1 to D10 below were approved as written.

---

## Context

Reasoning models take an effort setting (how hard to think), and providers spell it differently and refuse it differently. AGENTS.md section 13 does not list this feature in M6. Precedent (decisions 0028 to 0031) is that a feature added during M6 is the human's recorded choice.

A bug exists today without any effort setting: DeepSeek thinks by default and requires `reasoning_content` back on later requests when tools are sent, but the OpenAI-compatible adapter drops it, so DeepSeek agent runs fail from round 2. OpenRouter asks for `reasoning_details` back with tool calls.

## Options considered

1. **A per-chat effort value.** Needs session state and a second source of truth.
2. **A per-model effort value (chosen).** One stored value per model, edited wherever the model is chosen.
3. **No setting.** Providers' defaults only; the user cannot lower cost or raise quality.

## Decision

- **D1. Where it's set:** per model, stored in `models.effort`. Shown and changed on the Models screen card for cloud models (next to Reads images), in LocalPanel for local models (next to Context length), and in a compact select beside the model picker in Chat and the Workspace AI panel, which edits the same per-model value. No separate per-chat value.
- **D2. Levels:** `Default` (send nothing) and `Low`, `Medium`, `High`. Never `none`, `minimal`, `xhigh` or `max`: that is where providers differ and return 400.
- **D3. Thinking text is not shown.** It is kept only where a provider needs it sent back. Showing it is a separate later decision.
- **D4. Support is a stored capability, `models.effort_support`:** `levels` (low/medium/high), `toggle` (thinking on/off only, some Ollama models), `none` (refuses it), NULL (unknown). Filled from the provider where it reports it (Anthropic Models API, OpenRouter `supported_parameters`, Ollama `/api/show`), and set to `none` when a provider refuses the field. The user doesn't edit it.
- **D5. When to send:** send unless support is `none`. When unknown, send it; a 400/422 whose body names the field strips it, the request is retried once, and the reply's `Usage.effort_ignored` is true. The app then stores `effort_support = 'none'` and shows one line under the reply.
- **D6. Fixed for a whole agent run:** read once when the run starts. Anthropic silently drops thinking if the mode changes mid-turn, and a change invalidates the prompt cache.
- **D7. Anthropic:** Default sends no `output_config`. Effort High also raises `max_tokens` from 8,192 to 32,000 without tools, because thinking counts toward `max_tokens`. No `thinking` object is sent: `budget_tokens` is refused on 4.7+.
- **D8. Ollama `toggle` models:** Low, Medium and High all send `"think": true`. Default sends nothing.
- **D9. DeepSeek:** sends `low`/`medium`/`high` as they are. DeepSeek folds `medium` into `high`, so they behave the same there.
- **D10. A reply that spent its whole output budget on thinking** (stopped for length, no text, no tool call) is an error: "The model used its whole reply on thinking. Choose a lower effort and try again."

## Reasoning sent back (Task 1)

- `gateway/url.rs::reasoning_echo` classifies the base URL by parsed host, exact or as a `.`-prefixed suffix, never as a substring: `api.deepseek.com` is DeepSeek, `openrouter.ai` is OpenRouter, anything else None.
- DeepSeek: the stream's `reasoning_content` is accumulated and put on the assistant message. OpenRouter: `reasoning_details` fragments are merged by `index` (text concatenated) and put on the assistant message. Other hosts get nothing back. Reasoning is never shown and never added to the reply text.

## Consequences

- DeepSeek agent runs work past the first tool call.
- A new migration, adapter changes and UI selects follow in later tasks of the plan.
