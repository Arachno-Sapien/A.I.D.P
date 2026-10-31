# Progress

Updated: 2026-10-31 by Claude Code (Opus 5.5)

## Current milestone: M6 v0.1 release

Plan approved by the human on 2026-10-31 with the defaults for D1 to D6: phase doc `docs/phases/M6.md`, plan `docs/superpowers/plans/2026-10-30-m6-release.md`. Stop for review after Task 4. Before Task 5 the human creates the update signing key and hands over only the public key (D4).

- [ ] Idle RAM (no folder open) under 150 MB; workspace RAM within the budget set in M3 and M4
- [ ] Installers for Windows, macOS and Linux built by CI and published as a GitHub release
- [ ] Auto-update tested from one version to the next
- [ ] Tested on an 8 GB RAM machine with a real project open

Carry-overs: `docs/phases/M4.md` and `docs/phases/M5.md`, "What's left → To M6" (release RAM with the terminal and a local model, a job object for orphan processes, full-width lookalikes in commands, the cut-off Agent label). The human answered the OS question: v0.1 ships on Windows, macOS and Linux (decision 0016).

## Repo and dev machine (checked 2026-10-30)

| | |
| --- | --- |
| Repo | https://github.com/Arachno-Sapien/A.I.D.P (public), branch `main`. CI runs the gate on Windows, macOS and Linux since `52185e8` (run 41112982172 green) |
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

M6 Task 1 done 2026-10-31 by Claude Code (Opus 5.5): CI run 41112982172 green on Windows, macOS and Linux, with 211 Rust tests (1 ignored) and 187 Vitest tests on each; nothing needed fixing.
M6 Task 2 done 2026-10-31 by Claude Code (Opus 5.5) in `dada40c`: login-shell PATH on macOS and Linux (`login_path.rs`, called first in `main.rs`), Ollama paths on macOS, macOS login terminal. CI run 41115631396 green (214 Rust tests on Windows and Linux, 215 on macOS). Still assumed until a Mac user confirms: Finder's minimal PATH and the Ollama.app path.
M6 Task 3 done 2026-10-31 by Claude Code (Opus 5.5): job object for Stop on Windows (`dc84d24`); model commands refused for full-width characters everywhere and, on Windows, for any character the ANSI code page doesn't hold exactly or that gets an ASCII trail byte (three automated security reviews: `61a9ca4`, `9f2aa6a`, `b9ccfd3`). CI run 41121384526 green (217 Rust tests on Windows and macOS, 216 on Linux).
M6 Task 4 done 2026-10-31 by Antigravity (Gemini 2.5 Pro): Agent label `shrink-0 whitespace-nowrap` in `AiPanel.tsx`, model select `min-w-0 truncate` with `title` in `ModelPicker.tsx`; `inFlightReplies` in `createChatStore` retains originating `conversationId` and streamed text so partial replies on folder switch are saved to the correct conversation. 189 Vitest tests and 217 Rust tests passing.
Tasks 1 to 4 reviewed by Claude Code (Opus 5.5) on 2026-10-31: gate green (217 Rust, 189 Vitest), no blocking findings.
M6 Task 4b done 2026-10-31 by Claude Code (Opus 5.5): window 1024×640 (min 720×480, centred); file tree and AI panel toggle (Files / AI, Ctrl+B / Ctrl+Alt+B) and resize (`Splitter.tsx`), shrink before overflowing; AI panel reopens on a pending approval; shortcuts only on the Workspace screen. 196 Vitest, 217 Rust. The human checked it in the dev app on 2026-10-31: "Looks right".
The human created the update key on 2026-10-31: both GitHub secrets set; public key in `%USERPROFILE%\.tauri\aidp.key.pub` (key ID EE9A69E11D7D346C).
M6 Task 5 done 2026-10-31 by Claude Code (Opus 5.5): `tauri-plugin-updater` 2.14 (native-tls, no rustls), `plugins.updater` with the public key and the GitHub `latest.json` endpoint, `updates.rs`, `commands/updates.rs` (`app_version`, `check_update`, `install_update`), setting `check_updates_at_start`, `UpdateBar`, Settings → Updates, quiet check 10 s after start. 220 Rust, 204 Vitest. Install is untested until a release exists (Task 8).
M6 Task 6 done 2026-10-31 by Claude Code (Opus 5.5): `.github/workflows/release.yml` (one draft job, then a build matrix passing `releaseId`; actions pinned to commit hashes), `src-tauri/tauri.updater.conf.json`, bundle metadata, macOS ad-hoc signing, version `0.1.0-rc.1`, `docs/dev/release.md`. Release run 41188603905 (started by the human) passed first time: draft `v0.1.0-rc.1` (release id 429837322) holds the NSIS exe, universal dmg and app.tar.gz, AppImage and deb, each update file signed by key EE9A69E11D7D346C; `latest.json` lists all four platforms. The draft is NOT published.
M6 Task 7 done 2026-10-31 by Claude Code (Opus 5.5): decision 0017 (formats, no paid signing, updates, releasing); user guide Install per OS, Updates, troubleshooting; README Status and Download; CHANGELOG `0.1.0-rc.1`; setup.md "Building on macOS or Linux"; security.md unsigned installers; design risk row; known issues.
M6 Task 8 under way (Claude Code, Opus 5.5, with the human). 2026-10-31: the human published `v0.1.0-rc.1` (10:01 UTC; `releases/latest/download/latest.json` serves it), installed it on Windows (`%LOCALAPPDATA%\A.I.D.P\aidp.exe`, file version 0.1.0-rc.1) and reported every rc.1 check passed. A first RAM reading of the installed app, screen unknown, Ollama excluded: 137 MB Task Manager memory.
RAM of the installed rc.1 (2026-10-31, `docs/dev/measure-ram.md`): idle 127 MB; workspace 189 MB; with the terminal 192 MB; after a local-model reply with the terminal open 223–225 MB (197–199 MB without the user's shell). Ollama apart: server 89 MB, runner 3,177 MB. The human chose to look into the growth first. Root cause (Claude Code, 2026-10-31): every streamed chunk rendered every earlier message again (Markdown parse and code highlighting per message per chunk). Fixed by memoizing `MessageItem` in `MessageList.tsx` and `useCallback` in `AiPanel.tsx`: 20 messages went from 234 to 22 ms per chunk and +170 to +37 MB heap (browser, dev build). Not yet: virtualizing the message list (AGENTS.md stack says messages are virtualized; about 254 elements per reply stay on the page).
The human chose to virtualize first: done 2026-10-31 by Claude Code (Opus 5.5). `MessageList` uses react-virtual with measured rows and follows the end with `scrollToIndex`; `src/lib/virtual.ts` holds the zero-size fallback shared with `FileTree`. Browser measurement (dev build): a 200-message chat 1,571 page elements instead of 50,744; streaming into 100 messages 12 ms per chunk and +16 MB heap. 208 Vitest, 220 Rust.
The human checked chat scrolling, following the end while streaming, switching chats and Apply in the dev app on 2026-10-31: "All fine". Version set to `0.1.0-rc.2` (three files, CHANGELOG section).
The human asked when code files get coloured; it was a bug since M3 (grammars load lazily and the editor was created before they arrived). Fixed for rc.2 on 2026-10-31 by Claude Code (Opus 5.5): `loadLanguage` in `cm.ts`, awaited by the store's `editorState` and by `DiffView` before mounting; `mountDiff` takes the filename. 213 Vitest, 220 Rust. Not yet seen in the app.
Next step: push; the human runs the Release workflow and publishes rc.2 (normal release); the installed rc.1 should offer the update (the update test), and rc.2 should colour code files; then RAM again after a local-model reply, and the Linux/8 GB VM.

## Next 3 tasks

1. Push; the human runs the Release workflow for `0.1.0-rc.2` and publishes it (Task 8).
2. The update test from the installed rc.1; RAM again after a local-model reply; the Linux and 8 GB check in an Ubuntu VM (Task 8).
3. Review the whole M6 diff, then `0.1.0` and close M6 with the human (Task 8).
