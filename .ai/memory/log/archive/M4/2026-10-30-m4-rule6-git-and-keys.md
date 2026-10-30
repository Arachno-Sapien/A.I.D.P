# 2026-10-30 · M4 · rule 6: .git off limits, PGP and PuTTY keys
Agent: Claude Code (Opus 5.5)
Task: Close two gaps an automated push security review found (human: "Yes, widen it")
Changed: workspace/paths.rs (in_git_dir; resolve and resolve_new refuse .git, also through links), workspace/secret_files.rs (*.ppk, PGP and PuTTY keys), tools/run.rs (.git refusal text), AGENTS.md and design.md rule 6 word for word, docs/security.md, decision 0012
Decisions: 0012 (home-folder credential paths and token-format scanning left out)
Problems: Antigravity was running Task 10 in the same checkout and reverted my test-first edit to secret_files.rs when its gate went red. Did this work in a git worktree (../aidp-rule6, branch m4-rule6) and merged it. progress.md left alone (Antigravity had uncommitted edits in it).
Tests: 4 new or extended (git_folder_is_refused, git_folder_is_off_limits, is_secret_table, has_private_key_table)
Next: Antigravity finishes Task 10; then Tasks 11 and 12
