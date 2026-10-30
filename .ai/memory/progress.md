# Progress

Updated: 2026-10-30 by Claude Code (Opus 5.5)

## Current milestone: M4 Agent tools and terminal

Plan approved 2026-10-30 with the defaults for D1 (widen rule 6), D2 (limits) and D3 (shells). Plan: `docs/superpowers/plans/2026-10-30-m4-agent-tools.md` (12 tasks; stop for review after Task 7). Phase doc: `docs/phases/M4.md`. Tasks 1 to 7 (backend) done by Antigravity, reviewed and fixed by Claude Code on 2026-10-30 (log `2026-10-30-m4-review-fixes.md`). Not pushed.

- [ ] `ChatEvent::ToolCall` and tool calling in the OpenAI-compatible and Anthropic adapters
- [ ] `list_files`, `read_file`, `search`, `edit_file`, `create_file`, and `run_command` work inside the folder
- [ ] Every edit shows a diff first; every model command asks first; no auto-approve
- [ ] Secret-looking files are never read or sent unless the user adds them by hand
- [ ] The terminal panel runs the user's shell in the folder; model commands have a timeout and Stop
- [ ] Fake-provider tests: a model asking for a path outside the folder is refused, and a denied command never runs
- [ ] Models without tool calling still get the M3 workspace

Carry-overs from M3 are in `docs/phases/M3.md` under "What's left": M4 reuses `workspace::paths::resolve` and `secret_files::is_secret` for the tools.

## Repo and dev machine (checked 2026-10-30)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M3 pushed 2026-10-30, CI green on the Windows runner (run 40977017456) |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model; in-app connection stored in Windows Credential Manager and SQLite `aidp.db` |
| Test folders | `%USERPROFILE%\aidp-big` (10,000 files in `flat`, 100 folders of 100, `.env`, `notes.txt`, `crlf-bom.txt`; no git), made for the M3 live check |
| Memory | release build: 127 MB idle, 155 MB in the workspace (Task Manager memory); budget 200 MB. How: `docs/dev/measure-ram.md` |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build; pushed, CI green. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.
- M2 Keys and providers, closed 2026-10-30: OS keychain integration via `keyring` v4 and `SecretStore` trait, local SQLite persistence (`aidp.db`), Anthropic adapter with usage tracking, connection management service, first-run flow, Models screen, model picker grouped by provider, GFM tables with `remark-gfm`, and security documentation. Live-checked with dev app; decision 0007 in `docs/decisions/`. Details in `docs/phases/M2.md`.
- M3 Coding workspace, closed 2026-10-30: workspace path checks and secret filter in Rust, `.gitignore`-aware lazy tree, CodeMirror 6 tabs with line endings and BOM preserved, AI panel with file and selection context on its own chat surface, Apply → diff → Accept, no-git warning, unsaved-change prompts including quit, recent folders. Live-checked in dev and release; RAM measured and budget set. Decisions 0008 (folder picker) and 0009 (release CSP allows inline styles). Details in `docs/phases/M3.md`.

## In progress

Nothing claimed. Review fixes for Tasks 1 to 7 are committed; the tree is green.
Next step: M4 Task 8 (Agent mode in the AI panel) from the plan.

## Next 3 tasks

1. M4 Task 8: Agent mode in the AI panel.
2. M4 Tasks 9 and 10: terminal backend and panel.
3. M4 Tasks 11 and 12: docs, live check, close.
