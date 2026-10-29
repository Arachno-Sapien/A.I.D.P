# Progress

Updated: 2026-10-29 by Claude Code (Sonnet 5.5)

## Current milestone: M2 Keys and providers

M1 closed on 2026-10-29 (summary in `docs/phases/M1.md`). M2 has no plan yet.

- [ ] Add, test, and delete cloud connections from the Models page
- [ ] Keys saved in Windows Credential Manager, never in SQLite
- [ ] Anthropic adapter streams replies
- [ ] Every error kind shows a clear message in the UI

The M1 key file (`config.local.json`, `src-tauri/src/config.rs` and the "Configuration Required" panel) is deleted in M2. First launch should ask for the provider details itself ("Add a model"), as the human asked on 2026-10-29. Carry-overs from M1 are listed in `docs/phases/M1.md` under "What's left".

## Repo and dev machine (checked 2026-10-29)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. M1's commits are local until the human OKs the push |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |
| Provider for live checks | OpenRouter free model, details in `%APPDATA%\com.aidp.desktop\config.local.json` (outside the repo) |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.
- M1 Chat with one cloud model, closed 2026-10-29: gateway types and SSE parser, the OpenAI-compatible adapter (9 fake-server tests), the M1 config loader, chat commands with Stop, the navigation guard, the Zustand store, Markdown with a Copy button, and the chat screen. Live-checked with a real OpenRouter model in the dev app and the release build. Details in `docs/phases/M1.md`; decision 0006 (`native-tls`) in `docs/decisions/`.

## In progress

None. To claim: task / tool + model / date started / next step.

## Next 3 tasks

1. Human: OK (or not) pushing the M1 commits to GitHub. Then an agent pushes and confirms CI is green.
2. Plan M2 in `docs/superpowers/plans/`. Read `docs/design.md` ("Model layer", "API key security", "Flow: add a cloud model"), AGENTS.md sections 4 and 6, and `docs/phases/M1.md` ("What's left"). Add `list_models` and `test_connection` to the `ModelProvider` trait (deferred from M1), and settle with the human whether to add `remark-gfm` for tables. Get the human's OK on the plan before writing code.
3. Start `docs/phases/M2.md` with the plan summary (AGENTS.md section 10).
