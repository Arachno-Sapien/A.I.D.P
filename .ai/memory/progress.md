# Progress

Updated: 2026-10-29 by Claude Code (Sonnet 5.5)

## Current milestone: M2 Keys and providers

M1 is closed and pushed (summary in `docs/phases/M1.md`). The M2 plan is written and approved by the human on 2026-10-29 (decision D1: `remark-gfm` for tables stays in): `docs/superpowers/plans/2026-10-29-m2-keys-providers.md` (10 tasks). Phase doc: `docs/phases/M2.md`.

- [ ] Add, test, and delete cloud connections from the Models page
- [ ] Keys saved in Windows Credential Manager, never in SQLite
- [ ] Anthropic adapter streams replies
- [ ] Every error kind shows a clear message in the UI

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

None. To claim: task / tool + model / date started / next step.

## Next 3 tasks

1. The M2 plan is approved (2026-10-29, `remark-gfm` kept). Start with Task 1 and claim it in "In progress" first. After Task 5 stop for a review: Tasks 1 to 5 are the security core (keychain, connections service).
2. Execute M2 Tasks 1 to 5 (Rust: gateway helpers and `list_models`, Anthropic adapter, SQLite store, keychain wrapper, connections service), one commit per task, gate before each commit.
3. Execute Tasks 6 to 8 (commands, frontend data layer, UI) as one working tree and one commit, then Task 9 (docs) and Task 10 (the human's live check, review, close). Do not tick any M2 box before the human confirms the live check.
