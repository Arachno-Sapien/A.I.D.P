# Progress

Updated: 2026-10-29 by Antigravity (Gemini 3.8 Flash)

## Current milestone: M1 Chat with one cloud model

M0 closed on 2026-10-29 (summary in `docs/phases/M0.md`). M1 plan: `docs/superpowers/plans/2026-10-29-m1-chat.md` (8 tasks). Phase doc: `docs/phases/M1.md`.

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
- M1 Task 1: Gateway types (`ModelProvider`, `ChatEvent`, `ProviderError`, `Role`, `ChatMessage`, `ChatRequest`, `Usage`) and `SseLines` parser with tests.
- M1 Task 2: `OpenAiCompat` streaming adapter with 8 wiremock tests, decision record 0006 (`native-tls`), and docs.

## In progress

Plan: `docs/superpowers/plans/2026-10-29-m1-chat.md`
Current task: Task 3: Local config file loader
Agent: Antigravity (Gemini 3.8 Flash)
Date: 2026-10-29
Next step: Create src-tauri/src/config.rs with failing tests for LocalConfig, check_base_url, and secret redaction

## Next 3 tasks

1. Execute Task 3: Local config file loader for M1 key with security rules.
2. Execute Task 4: Chat commands, Stop, and navigation guard.
3. Execute Task 5: Chat store and error messages.
