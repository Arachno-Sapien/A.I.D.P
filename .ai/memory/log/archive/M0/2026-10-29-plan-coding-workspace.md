# 2026-10-29 · M0 · re-plan: coding workspace moves into v1
Agent: Claude Code (Opus 5.5)
Task: The human made the coding platform the main goal. Re-plan v1 around it (docs only, no code).
Changed: docs/design.md, docs/decisions/0005-coding-workspace-in-v1.md, AGENTS.md (sections 2, 3, 4, 5, 6, 7, 9, 13), README.md, .ai/memory/progress.md
Decisions:
- Decision 0005 (accepted): M0, M1 unchanged; M2 keys and providers; M3 coding workspace; M4 agent tools and terminal; M5 Ollama, history, settings; M6 v0.1 release.
- Workspace and tool security: 7 new rules in design.md and AGENTS.md section 6, word for word (one folder, Rust-only file/process access, diffs before writes, approval for every model command, tool output is data, secret files skipped, warn without git).
- Libraries, each added only when its milestone starts: CodeMirror 6 + @codemirror/merge, `ignore` crate (M3); xterm.js + portable-pty (M4). Monaco rejected (RAM).
- Built-in tools are in v1; an MCP client, browser checks and the practice area stay after v1.
- The 150 MB idle target now means no model loaded and no folder open; M3 and M4 record a workspace budget.
Problems: none.
Tests: gate green before commit; docs only.
Next: M0 close (human sends the GitHub URL, then push and CI; Rust book ch 1-9). Then write the M1 plan. M1's scope did not change.
