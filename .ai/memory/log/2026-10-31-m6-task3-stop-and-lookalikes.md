# 2026-10-31 · M6 · Task 3, Stop on Windows and lookalike characters
Agent: Claude Code (Opus 5.5)
Task: M6 Task 3, job object for Stop; refuse full-width characters in model commands
Changed: src-tauri/Cargo.toml (windows-sys 0.61, Windows only, already in the lockfile), tools/command.rs (`Job`), tools/run.rs (`received_differently`, `outside_code_page`), tests/tools.rs, docs/security.md, known-issues.md, plan, M6.md
Decisions: the job holds tokio's `raw_handle()` (not a PID); closed on Stop, timeout and finish. After three automated security reviews, on Windows a command may only use characters the ANSI code page holds exactly (WC_NO_BEST_FIT_CHARS), with no ASCII trail byte; the OEM page is not checked (console text, and it would refuse curly quotes and dashes; a probe listed both sets)
Problems: integration-test helpers aren't exempt from clippy `unwrap_used` (use `let Err(e) = … else { panic!() }`); GateGuard blocks first edits per file, so check partial batches (one batch left `Job` used before it was defined)
Tests: `stop_ends_a_detached_process` failed on Windows first (late.txt written), passes now; lookalike tests; `code_page_check_table` against code page 932; CI run 41121384526 green on all three OSes
Next: M6 Task 4, then review of Tasks 1 to 4
