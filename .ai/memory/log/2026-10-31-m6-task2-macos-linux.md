# 2026-10-31 · M6 · Task 2, macOS and Linux differences
Agent: Claude Code (Opus 5.5)
Task: M6 Task 2, login-shell PATH, Ollama on macOS, macOS login terminal
Changed: src-tauri/src/login_path.rs (new), lib.rs, main.rs, tools/pty.rs, ollama/process.rs, tests/tools.rs; plan and M6.md corrected
Decisions: read `PATH=` from `env` between markers instead of printing `$PATH` (fish joins it with spaces); skip when stdin is a terminal (no start-up cost from a shell); `apply_login_path` is an `unsafe fn` (sets env; call before threads)
Problems: the plan said the model was told cmd.exe on every OS; `specs()` already said sh off Windows (the planning grep only showed one line). Added a test, corrected the docs
Tests: 3 new (extract_path, run_with_limit, run_command description) on every OS, plus macos_shell_is_login on macOS; CI run 41115631396 green: 214 Rust (215 on macOS), 187 Vitest
Next: M6 Task 3, job object and full-width refusal
