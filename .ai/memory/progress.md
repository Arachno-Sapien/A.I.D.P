# Progress

Updated: 2026-10-30 by Claude Code (Opus 5.5)

## Current milestone: M2 Keys and providers

M1 is closed and pushed (summary in `docs/phases/M1.md`). The M2 plan is written and approved by the human on 2026-10-29 (decision D1: `remark-gfm` for tables stays in): `docs/superpowers/plans/2026-10-29-m2-keys-providers.md` (10 tasks). Phase doc: `docs/phases/M2.md`.

- [ ] Add, test, and delete cloud connections from the Models page
- [ ] Keys saved in Windows Credential Manager, never in SQLite
- [ ] Anthropic adapter streams replies
- [ ] Every error kind shows a clear message in the UI

Tasks 1 to 5 (gateway helpers, Anthropic adapter, SQLite store, keychain wrapper, connections service) are done and reviewed, 2026-10-30. No box is ticked: each needs the UI (Tasks 6 to 8) and the human's live check (Task 10).

The M1 key file (`config.local.json`, `src-tauri/src/config.rs` and the "Configuration Required" panel) is deleted in M2. First launch asks for the provider details itself ("Add a model"), as the human asked on 2026-10-29. Carry-overs from M1 are in `docs/phases/M1.md` under "What's left".

## Repo and dev machine (checked 2026-10-29)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M1 pushed 2026-10-29, CI green on the Windows runner (run 40917865542) |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model; its details are in `%APPDATA%\com.aidp.desktop\config.local.json` (outside the repo) until M2 replaces that file |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build; pushed, CI green. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.

## In progress

Task: M2 Task 8: UI: first-run flow, Models page, model picker (step 6 adds `remark-gfm`)
Tool + model: Antigravity (Gemini 3.8 Flash)
Date: 2026-10-30
Completed files in Tasks 6-8 commit:
- Task 6 done: `src-tauri/src/commands/connections.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/chat.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/config.rs` (deleted), `src/lib/bindings.ts` (regenerated), `src/lib/bindings.test.ts`
- Task 7 done: `src/features/models/providers.ts`, `src/features/chat/errorText.ts`, `src/features/chat/errorText.test.ts`, `src/features/chat/appErrorText.ts`, `src/features/chat/appErrorText.test.ts`, `src/features/models/store.ts`, `src/features/models/store.test.ts`, `src/features/chat/store.ts`, `src/features/chat/store.test.ts`
- Task 8 done: `src/features/models/ChooseModels.tsx`, `src/features/models/AddConnectionDialog.tsx`, `src/features/models/AddConnectionDialog.test.tsx`, `src/features/models/ModelsScreen.tsx`, `src/features/models/ModelsScreen.test.tsx`, `src/features/chat/ChatScreen.tsx`, `src/features/chat/ChatScreen.test.tsx`, `src/App.tsx`
Next step: Step 6 of Task 8: add remark-gfm for tables in replies, then Task 9 (Docs).

## Next 3 tasks

1. Task 8 step 6: `remark-gfm` tables in replies (decision D1).
2. Task 9: Docs (`docs/security.md`, `docs/decisions/0007-connections-storage.md`, `docs/setup.md`, `AGENTS.md`, `docs/design.md`, `.ai/memory/known-issues.md`, `CHANGELOG.md`, `docs/phases/M2.md`).
3. Task 10: Human check, review, close.
