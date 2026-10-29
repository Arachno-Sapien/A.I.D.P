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
- M1 Task 3: Local config file loader (`config.rs`) for M1 key with transport validation and secret redaction.
- M1 Task 4: Chat commands (`chat_config`, `send_message`, `stop_reply`), `ChatState`, navigation guard plugin, and bindings.
- M1 Task 5: Zustand chat store (`useChatStore`), normalized `errorText`, and unit tests.
- M1 Task 6: Markdown renderer with raw HTML off, Prism syntax highlighting, Copy button, and tests.
- M1 Task 7: Chat screen (`ChatScreen.tsx`), App.tsx wiring, removal of greet, setup guide and changelog docs.
- M1 Task 8: Code review against security and AGENTS.md checklist, phase doc M1 update, session log.

## In progress

Plan: `docs/superpowers/plans/2026-10-29-m1-chat.md`
Current task: fix the M1 review findings (empty stopped replies in history, in-stream provider errors, Stop before begin, IPv6 local hosts, M1.md boxes)
Agent: Claude Code (Opus 5.5)
Date: 2026-10-29
Next step: failing tests in store.test.ts, tests/openai_compat.rs, config.rs; then the fixes

## Next 3 tasks

1. Human verification with live OpenAI-compatible provider credentials.
2. Tick M1 boxes in `docs/design.md` and archive M1 logs to `archive/M1/`.
3. Plan and start Milestone M2: Keys and providers.
