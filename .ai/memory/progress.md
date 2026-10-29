# Progress

Updated: 2026-10-30 by Claude Code (Opus 5.5)

## Current milestone: M3 Coding workspace

Plan (approved 2026-10-30, defaults for D1 to D3): `docs/superpowers/plans/2026-10-30-m3-coding-workspace.md` (12 tasks; stop for a review after Task 4). Phase doc: `docs/phases/M3.md`.

- [ ] Open a folder; the file tree respects .gitignore and stays responsive on a 10,000-file folder
- [ ] Open, edit, and save files in CodeMirror 6 tabs, with unsaved changes marked
- [ ] The AI panel sends the open file and selection as context, streams replies, and Stop works
- [ ] Apply shows a diff; the file changes only after Accept
- [ ] Tests prove that `..`, absolute paths, and symlinks pointing outside the folder are refused
- [ ] A warning appears before the first AI edit in a folder without git
- [ ] RAM with a mid-sized repo open is measured and the workspace budget recorded in the phase doc

## Repo and dev machine (checked 2026-10-29)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M2 pushed 2026-10-30, CI green on the Windows runner (run 40949860167) |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model; in-app connection stored in Windows Credential Manager and SQLite `aidp.db` |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build; pushed, CI green. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.
- M2 Keys and providers, closed 2026-10-30: OS keychain integration via `keyring` v4 and `SecretStore` trait, local SQLite persistence (`aidp.db`), Anthropic adapter with usage tracking, connection management service, first-run flow, Models screen, model picker grouped by provider, GFM tables with `remark-gfm`, and security documentation. Live-checked with dev app; decision 0007 in `docs/decisions/`. Details in `docs/phases/M2.md`.

## In progress

Task: M3 Task 8: AI panel with context chips
Tool + model: Antigravity (Gemini 3.8 Flash)
Date: 2026-10-30
Next step: Step 1 of Task 8: create context.test.ts, implement workspace/context.ts, chipsFor, AiPanel.tsx.

## Next 3 tasks

1. Task 7: editor tabs (CodeMirror 6, tab bar, dirty tracking, conflict bar).
2. Task 8: workspace AI panel and Apply flow (two stores, selection context, diff display).
3. Task 9: diff review and accept flow (@codemirror/merge, accept/reject).
