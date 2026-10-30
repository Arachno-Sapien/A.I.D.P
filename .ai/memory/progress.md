# Progress

Updated: 2026-10-30 by Claude Code (Opus 5.5)

## Current milestone: M6 v0.1 release

Not started. No plan yet. Phase doc and plan come first (`docs/phases/M6.md`, `docs/superpowers/plans/`).

- [ ] Idle RAM (no folder open) under 150 MB; workspace RAM within the budget set in M3 and M4
- [ ] Installers for Windows, macOS and Linux built by CI and published as a GitHub release
- [ ] Auto-update tested from one version to the next
- [ ] Tested on an 8 GB RAM machine with a real project open

Carry-overs: `docs/phases/M4.md` and `docs/phases/M5.md`, "What's left → To M6" (release RAM with the terminal and a local model, a job object for orphan processes, full-width lookalikes in commands, the cut-off Agent label). The human answered the OS question: v0.1 ships on Windows, macOS and Linux (decision 0016).

## Repo and dev machine (checked 2026-10-30)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M5 pushed 2026-10-30, CI green on the Windows runner (run 41093564688) |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model; in-app connection stored in Windows Credential Manager and SQLite `aidp.db` |
| Test folders | `%USERPROFILE%\aidp-big` (10,000 files in `flat`, 100 folders of 100, `.env`, `notes.txt`, `crlf-bom.txt`; no git), made for the M3 live check |
| Memory | release build: 127 MB idle, 155 MB in the workspace (Task Manager memory); budget 200 MB. How: `docs/dev/measure-ram.md`. M4 and M5 release not measured (dev build 265 MB with the terminal open; carried to M6) |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build; pushed, CI green. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.
- M2 Keys and providers, closed 2026-10-30: OS keychain integration via `keyring` v4 and `SecretStore` trait, local SQLite persistence (`aidp.db`), Anthropic adapter with usage tracking, connection management service, first-run flow, Models screen, model picker grouped by provider, GFM tables with `remark-gfm`, and security documentation. Live-checked with dev app; decision 0007 in `docs/decisions/`. Details in `docs/phases/M2.md`.
- M3 Coding workspace, closed 2026-10-30: workspace path checks and secret filter in Rust, `.gitignore`-aware lazy tree, CodeMirror 6 tabs with line endings and BOM preserved, AI panel with file and selection context on its own chat surface, Apply → diff → Accept, no-git warning, unsaved-change prompts including quit, recent folders. Live-checked in dev and release; RAM measured and budget set. Decisions 0008 (folder picker) and 0009 (release CSP allows inline styles). Details in `docs/phases/M3.md`.
- M4 Agent tools and terminal, closed 2026-10-30 at the human's request: tool calling in both adapters with thinking blocks kept, six tools inside the folder, approvals decided in Rust, the command runner with timeout and Stop, the Agent switch and step cards, the terminal panel. Two reviews and three automated security reviews fixed; rule 6 widened twice (decisions 0010 and 0012); hidden characters in commands refused. Live check partly observed, the rest confirmed by the human; release RAM carried to M6. Decision 0011 (shells). Details in `docs/phases/M4.md`.
- M5 Ollama, history and settings, closed 2026-10-30 at the human's request: Ollama as a built-in connection with start, download, delete and Free memory; the Ollama adapter with tools; chat history with a sidebar and one conversation per folder; Settings (default model, theme, keep loaded); light and system themes. Two reviews fixed (lost replies when switching chats, Ollama error handling). Live check partly observed, the rest confirmed by the human; release RAM carried to M6. Decisions 0013 to 0015. Details in `docs/phases/M5.md`.

## In progress

Nothing claimed. M5 was closed by Claude Code (Opus 5.5) at the human's request, taking over Antigravity's Task 12 claim.
Next step: Claude Code writes the M6 plan (decision 0016 lists the macOS and Linux points to put to the human).

## Next 3 tasks

1. M6 plan (Claude Code): phase doc, plan, and the open questions put to the human with defaults.
2. M6 tasks: release RAM, CI installer, auto-update, the 8 GB machine.
3. v0.1 release.
