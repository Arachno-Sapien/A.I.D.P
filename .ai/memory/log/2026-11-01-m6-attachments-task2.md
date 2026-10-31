# 2026-11-01 · M6 · attachments Task 2 (to the models)
Agent: Claude Code (Opus 5.5)
Task: docs/superpowers/plans/2026-11-01-m6-attachments.md Task 2 ("Start Task 2 here")
Changed: gateway/mod.rs (ImageInput, ChatRequest.images), openai_compat.rs, anthropic.rs, ollama_chat.rs (image encoding), attachments/mod.rs (ChatInput, AttachmentRef, resolve, prepare), tools/agent.rs (run_with_images), connections.rs (stream images, supports_vision, ChatModel.supports_vision, Ollama sync), db (migration 6, ChatModelRow, set_supports_vision), ollama/mod.rs (ModelDetails.supports_vision), commands/chat.rs (send_message and run_agent take ChatInput), store.ts (type only), bindings, docs/design.md, decision 0019
Decisions: images on ChatRequest (7 literals) instead of ChatMessage (20); agent::run kept, run_with_images added (11 AgentRun literals in tests untouched); ChatModel.supports_vision skip_serializing_if so 36 TS fixtures stay valid; a missing attachment is named in the text, not fatal
Tests: 8 new (3 adapter body shapes, 5 resolve: join and images, fence, budget cut, no-vision refusal, missing file) plus vision asserts in the Ollama show and sync tests and supports_vision read-back; red first (compile); 246 Rust, 233 Vitest, clippy and typecheck clean
Not yet: the UI (Task 3); nothing sent with attachments from the app yet
Next: Task 3, Composer paperclip/paste/chips, drop listener, message chips, CSP for thumbnails
