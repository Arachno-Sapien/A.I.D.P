# 2026-11-21 · M6 · effort levels
Agent: Claude Code (Sonnet 5.5), subagent-driven; plan and decisions D1-D10 approved by the human ("Subagent-driven", 2026-11-21)
Task: per-model effort (thinking) levels, decision 0033 (docs/decisions/0033-effort-levels.md)
Changed: gateway adapters (openai_compat, anthropic, ollama_chat, url.rs reasoning_echo), db migration 10, model options and set_model_effort, src/features/models (EffortSelect, Models screen, picker), docs (user guide, design, CHANGELOG), memory.
Decisions: no ChatEvent::Thinking (thinking text not shown); xhigh/max, OpenRouter reasoning object form and Anthropic adaptive thinking not built.
Tests: gate run in Task 9, see commit.
Live check (needs the human's own keys): NOT DONE YET, needs the human's keys. Nothing below was tried.
- [ ] one OpenAI reasoning model at Low and High (token counts differ)
- [ ] a non-reasoning OpenAI model: "ignored" line appears once, select then disabled
- [ ] Claude at High: longer answer, no error
- [ ] an Ollama thinking model (think sent) and a non-thinking one (no error)
- [ ] a DeepSeek agent task with two tool calls
Next: the human runs the live check in `npm run tauri dev`, then review and merge.
