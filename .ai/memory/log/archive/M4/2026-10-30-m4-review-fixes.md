# 2026-10-30 · M4 · review and fixes for Tasks 1 to 7
Agent: Claude Code (Opus 5.5)
Task: Review Antigravity's M4 Tasks 1 to 7 against the plan; fix the findings (human: "Yes, fix here")
Review: gate green (154 Rust tests), milestone tests real, loop invariants hold, rule 6 word for word. Probes confirmed the bugs below.
Changed:
- workspace/search.rs: regular files only (read through links to .env and outside the folder); unreadable entries skipped
- workspace/files.rs list_tree: unreadable entries skipped
- workspace/paths.rs resolve_new: folder boundary checked before "already exists" (was an existence oracle through a link)
- tools/run.rs: read_file cuts a single line over READ_LIMIT (1.5 MB minified file was sent whole); prepare_create allows secret-looking names (.env.example), as the plan says
- tools/agent.rs: no tools run on the 25th step
- tools/command.rs: reading the output is raced against Stop and the timeout (a background process held the pipe: Stop at 1 s returned at 6 s); async taskkill; Unix kill gets `--`
- gateway/anthropic.rs: append in place through as_object_mut (panic on a non-object block; was quadratic)
- gateway/openai_compat.rs: blank arguments become {}
Tests: 6 new (search_skips_links, read_file_cuts_one_huge_line, stop_/timeout_works_with_a_background_process, malformed_content_block_does_not_panic, blank_arguments_mean_no_arguments); 4 extended (resolve_new_table, read_file_ranges_and_cut, create_file_flow, step_limit)
Problems: GateGuard hook blocks the first edit of every file; state the facts and retry
Not fixed: unreadable-entry skip has no test (needs ACL changes on Windows)
Next: M4 Task 8 (Agent mode in the AI panel)
