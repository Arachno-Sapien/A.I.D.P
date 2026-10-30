# 2026-10-30 · M5 · review and fixes for Tasks 1 to 5
Agent: Claude Code (Opus 5.5)
Task: Review Antigravity's M5 Tasks 1 to 5 against the plan; fix the findings (human: "Yes, fix here")
Review: gate green (204 Rust, 153 vitest), every planned test present, agent runs get num_ctx and the text budget; the unlazy skill commit checked (copies identical, lockfile and AGENTS.md row, no hook wired, no network calls)
Changed (worktree ../aidp-m5fix, branch m5-review1, merged):
- connections.rs: delete_local_model / unload_local_model check the model name before any request (the commands call them); set_model_context prefers the Ollama row when a cloud model has the same name
- gateway/ollama_chat.rs: HTTP errors go through map_http_error (a 500 mentioning "not found" was ModelNotFound); replayed tool arguments are always an object (Ollama's api/types.go parses them into a map)
- ollama/process.rs: find_binary skips relative PATH entries (a planted ollama.exe in the working directory)
- ollama/mod.rs: local_num_ctx and DEFAULT_NUM_CTX replace four copies of the 8,192-cap rule
Tests: 5 new (local_num_ctx_table, relative_path_entries_are_skipped, set_model_context_targets_the_local_model, local_model_names_are_checked, server_error_mentioning_not_found_is_not_model_not_found), 1 extended (string_arguments_are_parsed); 209 Rust tests pass
Next: M5 Task 6 (chat history in the UI)
