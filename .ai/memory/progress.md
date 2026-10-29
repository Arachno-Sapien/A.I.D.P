# Progress

Updated: 2026-10-29 by Claude Code (Opus 5.5)

## Current milestone: M1 Chat with one cloud model

M0 closed on 2026-10-29 (summary in `docs/phases/M0.md`). M1 has no plan yet.

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

1. Write the M1 plan in `docs/superpowers/plans/`. Read `docs/design.md` "Model layer", AGENTS.md sections 4 and 6, and the "Streaming parsers" entry in `known-issues.md` first. Get the human's OK on the plan before writing code.
2. Start `docs/phases/M1.md` with the plan summary (AGENTS.md section 10).
3. Execute M1 task by task. Likely first task: `src-tauri/src/gateway/mod.rs` (ModelProvider trait, ChatEvent, ProviderError) and the OpenAI-compatible adapter, with wiremock tests for success, 401, 429 and a dropped stream.
