# 2026-11-11 · M6 · Reads images for cloud models
Agent: Claude Code (Opus 5.5), a side session started by the main session
Task: Let the user mark a cloud model as reading images, so cloud vision models get Browser checks screenshots (follow-up of decision 0031)
Changed: db/connections.rs (`set_models` keeps `supports_vision` with `num_ctx`; `set_supports_vision` returns whether a row changed), connections.rs (`Services::set_model_vision`, refuses Ollama connections and unknown models), commands/connections.rs + lib.rs (`set_model_vision`), bindings, ModelsScreen.tsx (each chosen model on a cloud card: "Reads images" Not sure / Yes / No)
Decisions: no new record; decision 0031 Consequences updated. Ollama models keep the flag Ollama reports (the control shows only on cloud cards, and Rust refuses Ollama)
Docs: decision 0031, user guide (attachments, Browser checks), design.md data model, CHANGELOG
Tests: db `set_models_preserves_supports_vision`, service round trip + refresh keeps it + NotFound, Ollama refused, ModelsScreen select. Seen failing first (db, UI). Gate: clippy clean, rust 325, typecheck clean, vitest 382
Not checked live: a cloud model set to Yes getting a real screenshot in the Workspace agent (path is `commands/chat.rs` vision = `supports_vision == Some(true)`, covered by the service test)
Next: live check with an OpenRouter vision model and the Browser checks preset
