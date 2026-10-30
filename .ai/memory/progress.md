# Progress

Updated: 2026-10-30 by Claude Code (Opus 5.5)

## Current milestone: M5 Ollama, history and settings

Plan approved 2026-10-30 with the defaults for D1 to D5: `docs/superpowers/plans/2026-10-30-m5-ollama-history-settings.md` (12 tasks; stop for review after Task 5). Phase doc: `docs/phases/M5.md`. No code yet.

- [ ] App detects Ollama and starts it if stopped
- [ ] Downloaded models appear in the picker and work in Chat and the workspace
- [ ] Download with progress and cancel; delete with confirmation; Free memory unloads the model
- [ ] Chats survive an app restart, and each message records its model
- [ ] Settings for default model, theme, and keep\_alive work

Carry-overs: `docs/phases/M3.md` and `docs/phases/M4.md`, "What's left → To M5" (Ollama tool calling, context cap by the model's window, keeping the agent conversation, RAM with Ollama on the 8 GB machine). Open question for the human before planning (AGENTS.md section 14): link to the Ollama installer, or download and run it from inside the app?

## Repo and dev machine (checked 2026-10-30)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M4 code pushed 2026-10-30, CI green on the Windows runner (run 41051878635) |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model; in-app connection stored in Windows Credential Manager and SQLite `aidp.db` |
| Test folders | `%USERPROFILE%\aidp-big` (10,000 files in `flat`, 100 folders of 100, `.env`, `notes.txt`, `crlf-bom.txt`; no git), made for the M3 live check |
| Memory | release build: 127 MB idle, 155 MB in the workspace (Task Manager memory); budget 200 MB. How: `docs/dev/measure-ram.md`. M4 release not measured (dev build 265 MB with the terminal open; carried to M6) |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build; pushed, CI green. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.
- M2 Keys and providers, closed 2026-10-30: OS keychain integration via `keyring` v4 and `SecretStore` trait, local SQLite persistence (`aidp.db`), Anthropic adapter with usage tracking, connection management service, first-run flow, Models screen, model picker grouped by provider, GFM tables with `remark-gfm`, and security documentation. Live-checked with dev app; decision 0007 in `docs/decisions/`. Details in `docs/phases/M2.md`.
- M3 Coding workspace, closed 2026-10-30: workspace path checks and secret filter in Rust, `.gitignore`-aware lazy tree, CodeMirror 6 tabs with line endings and BOM preserved, AI panel with file and selection context on its own chat surface, Apply → diff → Accept, no-git warning, unsaved-change prompts including quit, recent folders. Live-checked in dev and release; RAM measured and budget set. Decisions 0008 (folder picker) and 0009 (release CSP allows inline styles). Details in `docs/phases/M3.md`.
- M4 Agent tools and terminal, closed 2026-10-30 at the human's request: tool calling in both adapters with thinking blocks kept, six tools inside the folder, approvals decided in Rust, the command runner with timeout and Stop, the Agent switch and step cards, the terminal panel. Two reviews and three automated security reviews fixed; rule 6 widened twice (decisions 0010 and 0012); hidden characters in commands refused. Live check partly observed, the rest confirmed by the human; release RAM carried to M6. Decision 0011 (shells). Details in `docs/phases/M4.md`.

## In progress

Claimed by Antigravity (Gemini 2.5 Pro), 2026-10-30.
Task: M5 Task 3 - Ollama chat adapter (src-tauri/src/gateway/ollama_chat.rs, ConnectionKind::Ollama, ChatRequest.local).
Next step: Step 1 - write failing tests in `tests/ollama_chat.rs`.

## Next 3 tasks

1. M5 Tasks 1 to 5 (history storage, Ollama client, Ollama adapter, Ollama in the app, text budget).
2. Claude Code's review of Tasks 1 to 5 before any UI.
3. M5 Tasks 6 to 12 (UI, docs, live check and close).
