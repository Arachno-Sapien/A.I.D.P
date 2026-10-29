# Progress

Updated: 2026-10-29 by Claude Code (Opus 5.5)

## Current milestone: M1 Chat with one cloud model

M0 closed on 2026-10-29 (summary in `docs/phases/M0.md`). M1 plan: `docs/superpowers/plans/2026-10-29-m1-chat.md` (8 tasks), waiting for the human's OK. Phase doc: `docs/phases/M1.md`.

- [ ] Type a message and get a streamed reply from one OpenAI-compatible provider
- [ ] Stop cancels a reply midway
- [ ] Code blocks render with a copy button
- [ ] Adapter tests cover success, 401, 429, and a dropped stream

For M1 only, the key comes from a git-ignored local config file (`config.local.json` is already in `.gitignore`). M2 replaces it with the keychain. Zustand and `@testing-library/react` were deferred from M0 and arrive with M1's first store and component test.

## Repo and dev machine (checked 2026-10-29)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`, CI green on every push |
| Node / npm | v22.22.2 / 12.0.1 |
| git / gh | 2.51.2 / 2.98.0 (gh logged in as Arachno-Sapien) |
| Rust | rustc 1.99.1, cargo 1.99.1, stable-msvc |
| VS Build Tools | 2022 and 2026, C++ workload |
| Ollama | installed, server not running |

## Done

- M0 Setup, closed 2026-10-29: app shell, typed IPC, gate, CI, docs, license, README, and the re-plan around the coding workspace. Details in `docs/phases/M0.md`; decisions 0001 to 0005 in `docs/decisions/`.

## In progress

None. To claim: task / tool + model / date started / next step.

## Next 3 tasks

1. Human: review the M1 plan and say OK (or ask for changes). No code before that.
2. Execute M1 plan Tasks 1 to 3 (gateway types and SSE parser, OpenAI-compatible adapter with wiremock tests, local config file), one commit per task.
3. Execute Tasks 4 to 8 (commands and Stop, store, Markdown, chat screen with the human's check, review and close).
