# AGENTS.md

Shared rules for every AI coding agent on this project: Claude Code, Codex, Antigravity, Gemini CLI, Cursor, Copilot, and whoever comes next. Tool-specific files (`CLAUDE.md`, `GEMINI.md`) only point here, so nothing is written twice.

**Read this whole file before touching code.** Then follow section 1.

- Full design (source of truth for behaviour, screens, schema): [`docs/design.md`](docs/design.md).
- Current state of the work: [`.ai/memory/progress.md`](.ai/memory/progress.md). This file holds rules, not status.

---

## 1. Start and end of every session

Several agents and tools share this repo, and any of them can run out of tokens mid-task. The memory folder is how the next one picks up exactly where the last one stopped.

**Start of session (before editing anything):**

1. Read this file, `.ai/memory/progress.md`, `.ai/memory/known-issues.md`, and the 3 newest files in `.ai/memory/log/`.
2. Run `git status` and `git log --oneline -10`. Compare with the "In progress" note in `progress.md`. If they disagree, trust git and fix the note.
3. Run the checks in section 8. Know whether the tree is green before you change it.
4. **Claim your task:** edit the "In progress" block in `progress.md` (task, your tool + model, date, next step) *before* writing code.

**While working (so a sudden stop loses nothing):**

- Work in small steps. After each step that passes the checks, commit (`M1: stream replies from openai adapter`).
- Keep the "Next step" line in `progress.md` current. One sentence, specific enough for a stranger: file, function, what's left.
- Never commit a red tree. If you must stop while it's red, leave the changes uncommitted and say exactly what's broken in `progress.md`.
- If you sense your context or token budget is running low, stop starting new work. Get to green, then do the end-of-session steps.

**End of session:**

1. Write a new log file in `.ai/memory/log/` (template in section 11).
2. Update `progress.md`: move finished items to Done, refresh In progress / Next 3.
3. Anything that wasted time goes into `known-issues.md` so nobody retries it.
4. Commit the memory files with the code.

---

## 2. What we are building

A **Tauri 2 desktop app** where one person connects cloud models (with their own API keys) and local Ollama models, then chats with any of them from one place. Everything runs on the user's computer: no server, no accounts, no monthly bill.

**v1 goals**

- One model picker that lists cloud and local models together, with clear status for each.
- API keys stored only in the OS keychain and sent only to their own provider.
- Full Ollama control from inside the app: detect, start, list, download, delete, unload models.
- Light: **under 150 MB RAM at idle** with no model loaded.
- Windows first (the dev machine), then macOS and Linux.

**Not in v1. Don't build these, don't scaffold "for later":** practice area, coding workspace, browser automation, MCP tools, user accounts or sync, a built-in inference engine, mobile apps.

**Three screens:** Chat, Models, Settings. Details: design doc, "Screens and user flows".

---

## 3. Stack

Chosen for low memory use and tools agents know well. **No new dependency without a stated reason** in the commit message and, for a real choice between alternatives, a decision record.

| Layer | Choice |
| --- | --- |
| App shell | Tauri 2 (system WebView) |
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS (no component library) |
| UI state | Zustand |
| Typed IPC | tauri-specta (generates `src/lib/bindings.ts`) |
| HTTP + async | reqwest + tokio (cancellation: `tokio_util::sync::CancellationToken`) |
| Key storage | `keyring` crate (Windows Credential Manager / macOS Keychain / Linux Secret Service) |
| Secret handling | `secrecy` crate (`Secret` prints as `[REDACTED]`) |
| Database | SQLite via `rusqlite`, accessed only from Rust |
| Markdown | react-markdown + Prism, **raw HTML off** |
| Long lists | @tanstack/react-virtual |
| Tests | `cargo test` + wiremock (fake provider servers), Vitest |
| Builds | GitHub Actions + tauri-action |

Package manager: **npm**.

---

## 4. Architecture rules

```
React UI ──commands──▶ Rust core ──▶ OS keychain
         ◀──Channel───            ──▶ SQLite file
          (token stream)          ──▶ cloud providers (HTTPS)
                                  ──▶ Ollama at 127.0.0.1:11434
```

- **The UI talks only to the Rust core.** The core holds the keys, makes every network call, manages Ollama, and saves chats. The UI never calls `fetch`/XHR and never calls `invoke()` by hand; it uses only the generated `commands` from `src/lib/bindings.ts`.
- **Tauri commands are thin:** parse args, call into `gateway/`, `ollama/`, `db/` or `secrets.rs`, map the error. No business logic in `commands/`.
- **All chat goes through one trait.** The UI never knows which provider it is talking to:

```rust
#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError>;
    async fn test_connection(&self) -> Result<(), ProviderError>;
    async fn stream_chat(
        &self,
        req: ChatRequest,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Usage, ProviderError>;
}
```

| Adapter (`src-tauri/src/gateway/`) | Covers |
| --- | --- |
| `openai_compat.rs` | OpenAI, OpenRouter, Groq, DeepSeek, Gemini (compat endpoint), LM Studio, any custom endpoint. Configured by base URL + key + model |
| `anthropic.rs` | Claude models. System prompt sits outside the message list; different stream events |
| `ollama_chat.rs` | Local Ollama via `/api/chat`, so the app can set `num_ctx` and `keep_alive` per request |

- **Streaming:** Rust sends `ChatEvent::Delta(text)` through a Tauri `Channel`, then exactly one `Done(usage)` or `Error(kind)`.
- **Stop:** cancels the token. The adapter drops the HTTP stream and saves the partial reply with status `stopped`.
- **Normalized errors:** every adapter maps provider responses into exactly these: `InvalidKey` (401, 403), `RateLimited` (429, with retry time if sent), `ModelNotFound`, `ContextTooLong`, `Offline` (no internet / Ollama not running), `ProviderError` (5xx and anything unexpected), `Cancelled`. The UI shows one message per kind, the same everywhere.
- **Capabilities per model:** streaming, tool calling, vision, context window stored as yes / no / unknown. Fill from the provider where it reports them (Ollama `/api/show`), otherwise user-set.
- **Leave room for later, cheaply:** message content is a list of parts (text now; images and tool calls later), and `ChatEvent` stays open for a future `ToolCall` variant. This is the *only* future-proofing allowed. No MCP or tool code in v1.
- **Each message stores its own `model_ref`,** so switching models mid-chat keeps a correct record.
- **Schema changes go through numbered migrations** from day one.

Ollama endpoints, data model (5 tables), and UI flows: see the design doc sections "Local models (Ollama)", "Data model", "Screens and user flows".

---

## 5. Project structure and folder ownership

Frontend in `src/`, Rust core in `src-tauri/`. **Each folder has one job; touch only the folders your task needs.** An agent working on Ollama never edits key storage. If a plan touches a folder outside its area, say why in the plan.

```text
AGENTS.md                  this file
CLAUDE.md                  one line: @AGENTS.md
GEMINI.md                  pointer to this file (Gemini CLI / Antigravity)
CHANGELOG.md
skills-lock.json           sources + hashes of installed agent skills (section 12)
.agents/skills/            agent skills for Codex, Antigravity, Gemini CLI, Cursor, Copilot
.claude/skills/            identical copy for Claude Code
.ai/memory/                progress, known issues, session logs (section 11)
src/                       React frontend
  features/chat/
  features/models/
  features/settings/
  lib/bindings.ts          generated by tauri-specta, NEVER edited by hand
src-tauri/
  capabilities/            Tauri permission files
  src/
    main.rs
    commands/              thin Tauri commands, one file per area
    gateway/
      mod.rs               ModelProvider trait, ChatEvent, ProviderError
      openai_compat.rs
      anthropic.rs
      ollama_chat.rs
    ollama/                detect, start, pull, ps, delete, unload
    secrets.rs             keychain wrapper, the ONLY file that touches keys
    db/                    schema, migrations, queries
  tests/                   adapter tests against wiremock fake servers
docs/
  design.md                the design doc (moved here in M0)
  setup.md                 fresh Windows machine → running app
  security.md
  user-guide.md
  phases/                  M0.md … M5.md
  decisions/               one page per decision (0001-use-tauri.md, …)
  dev/                     how-tos for repeat tasks (add an adapter, add a command, release)
```

---

## 6. API key security (word for word from the design doc; do not weaken)

1. **Keychain only.** Keys live in the OS keychain through the keyring crate, one entry per connection. SQLite stores only the connection details and the last 4 characters.
2. **One way in, no way out.** The UI sends the key once in `add_connection`. Rust tests it, saves it, and returns the masked form. No command ever returns a full key.
3. **Never logged.** Keys are held in a `Secret` type from the secrecy crate, which prints as \[REDACTED\]. Never log request headers.
4. **HTTPS for cloud.** Plain http is allowed only for localhost or a local network address, with a visible warning.
5. **Locked-down app.** Expose only the app's own commands through Tauri's capability files. Turn off unused plugins, set a strict content security policy, and never load remote web pages in the app window.
6. **Safe rendering.** Model replies render as Markdown with raw HTML turned off, so a reply can't inject scripts into the app.
7. **Clean delete.** Removing a connection also deletes its keychain entry.

On Linux, the keyring needs a Secret Service (GNOME Keyring or KWallet). If none is found, show a clear error instead of falling back to plain-text storage.

**M1 exception only:** the key comes from a git-ignored local config file. M2 replaces it with the keychain and deletes that path.

---

## 7. Never

- No `unwrap()` or `expect()` outside tests. Return `Result` and use `?`.
- No new dependency without a stated reason.
- No hand edits to `src/lib/bindings.ts`. It is regenerated from Rust.
- No command that returns a key, and no log line that contains a key or a request header.
- No real keys, tokens, or personal data in code, tests, docs, or memory files. Use placeholders like `sk-...XXXX`.
- No new Tauri plugin or capability permission without saying why in the commit.
- No plain-text fallback for key storage, ever.
- No raw HTML rendering of model output.
- No work on "Not in v1" features, and no starting the next milestone before the current one is done.
- No deciding an open question (design doc, "Open questions") on your own. Ask the human, then record a decision.
- No editing old session logs. Correct them in a new one.

---

## 8. Commands

Prerequisites (Windows): Node ≥ 22, Rust stable with the **MSVC** toolchain (`rustup default stable-msvc`), Visual Studio Build Tools with "Desktop development with C++", WebView2 (preinstalled on Windows 11), Ollama for local models. `docs/setup.md` is the step-by-step version. Check `progress.md` for what is installed on the dev machine.

| Purpose | Command |
| --- | --- |
| Install JS deps | `npm install` |
| Run the app (dev) | `npm run tauri dev` |
| Regenerate `bindings.ts` | `cargo test --manifest-path src-tauri/Cargo.toml` (`export_bindings` test) |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| TS typecheck | `npm run typecheck` (script: `tsc --noEmit`) |
| Frontend tests | `npx vitest run` |
| Release build | `npm run tauri build` |

**The gate:** clippy, cargo test, typecheck, and vitest must all pass before every commit. CI runs the same four on every push.

---

## 9. Workflow for every task

1. Pick **one small task** from the current milestone in `progress.md` (a few hours of work at most). Claim it (section 1).
2. **Plan first.** List the files you'll touch. Check they're only in the folders the task needs. For anything multi-file, use the `writing-plans` skill.
3. Write the code **and the tests** together (`test-driven-development` skill). Adapter tests use wiremock fake servers and cover at least: success, 401, 429, dropped stream.
4. Run the gate (section 8). Use `verification-before-completion` before you say "done".
5. Check the diff against the review checklist, update docs in the **same commit**, commit.

When something breaks, use `systematic-debugging`: find the root cause before changing code. Don't stack guesses.

**Review checklist (every change)**

- [ ] Does any command now return or log a key or a request header?
- [ ] Was a new Tauri permission or plugin added? Why?
- [ ] Any new dependency? Is it widely used and maintained?
- [ ] Any `unwrap()` or `expect()` in non-test code?
- [ ] Were tests, docs, and the memory log updated?
- [ ] Does the app still start and stream a reply?

**Code style:** smallest change that works; reuse what's already in the repo before writing new helpers; no abstraction with a single implementation (the `ModelProvider` trait is the deliberate exception); boring over clever.

---

## 10. Documentation rules

| Doc | Location | Written or updated when |
| --- | --- | --- |
| Design doc | `docs/design.md` | Moved there in M0; updated whenever a design decision changes |
| Setup guide | `docs/setup.md` | M0, then whenever a tool, version, or setup step changes. Must take a fresh Windows machine to a running app |
| Phase docs | `docs/phases/M0.md` … `M5.md` | Start of each milestone (the plan) and end (what was built, what changed, what's left) |
| Decision records | `docs/decisions/NNNN-title.md` | Whenever a choice is made between real alternatives. One page: context, options, choice, why |
| Developer guide | `docs/dev/` | When a task repeats: adding an adapter, adding a Tauri command, running tests, making a release |
| Security notes | `docs/security.md` | M2, then with any change to key handling, permissions, or network calls |
| Changelog | `CHANGELOG.md` | Every user-visible change, grouped by version |
| User guide | `docs/user-guide.md` | M5: install, add a model, connect Ollama, troubleshooting |

1. Docs change in the same commit as the code they describe. A behaviour change without its docs is not done.
2. Short and current beats long and stale. Delete outdated text instead of stacking notes on top.
3. Docs never contain real keys, tokens, or personal data.

---

## 11. Agent memory (`.ai/memory/`, committed to git)

```text
.ai/memory/
  progress.md        current milestone: done, in progress, next 3 tasks
  known-issues.md    bugs, gotchas, approaches that failed (don't retry)
  log/
    YYYY-MM-DD-mN-topic.md   one file per agent session
    archive/MN/              logs moved here once a milestone closes
```

**Session log template** (under ~30 lines: facts, paths, decisions, no narration):

```markdown
# 2026-11-02 · M1 · streaming chat
Agent: Claude Code (model name)
Task: Stream replies from the OpenAI-compatible adapter
Changed: src-tauri/src/gateway/openai_compat.rs, src/features/chat/
Decisions: Tauri Channel instead of events (docs/decisions/0003)
Problems: SSE lines split across chunks; fixed with a line buffer
Tests: cargo test passes; 3 adapter tests added
Next: Stop button cancels the stream
```

**Memory rules**

1. Start of session: read AGENTS.md, progress.md, known-issues.md, and the 3 newest logs before touching code.
2. End of session: write a new log and update progress.md. Anything that wasted time goes into known-issues.md.
3. Append-only logs. Never edit an old log; correct it in a new one.
4. Short entries. Under ~30 lines.
5. Milestone close: summarise that milestone's logs into its phase doc, then move them to `log/archive/MN/`.
6. No secrets. Never write keys, tokens, or personal data into any memory file.

---

## 12. Agent skills (installed in this repo)

Skills are folders with a `SKILL.md` (the open Agent Skills format). They're committed to the repo so every tool on every machine gets the same set.

| Tool | Reads rules from | Reads skills from |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills/` |
| Codex | `AGENTS.md` | `.agents/skills/` |
| Antigravity | `AGENTS.md` / `GEMINI.md` | `.agents/skills/` |
| Gemini CLI | `GEMINI.md` → `@AGENTS.md` | `.agents/skills/` |
| Cursor, Copilot | `AGENTS.md` | `.agents/skills/` |

If your tool doesn't load skills automatically (or looks in a different folder), open the `SKILL.md` directly and follow it. It's plain Markdown.

| Skill | Source | Use it when |
| --- | --- | --- |
| `tauri` | hairyf/skills (generated from official tauri-apps/tauri-docs, Tauri v2) | Commands, Channels, capabilities/permissions, CSP, config, plugins, bundling, updater |
| `rust-best-practices` | apollographql/skills | Writing or reviewing any Rust: ownership, `Result`/errors, clippy, async, performance |
| `vercel-react-best-practices` | vercel-labs/agent-skills | Writing or reviewing React. **Ignore the `server-*` and Next.js rules.** This app is a client-only Vite SPA with no server |
| `vitest` | antfu/skills (generated from official vitest docs) | Frontend tests, mocking, config |
| `writing-plans` | obra/superpowers | Before any multi-file task: write the plan first |
| `test-driven-development` | obra/superpowers | Adapters, db, anything with logic: test first, watch it fail, then implement |
| `systematic-debugging` | obra/superpowers | Any bug or failing test, before proposing a fix |
| `verification-before-completion` | obra/superpowers | Before saying a task is done: run the gate, show the output |

**Managing skills**

- Restore from the lockfile (fresh clone, missing folders): `npx skills experimental_install`
- Update: `npx skills update`, then **read the diff** before committing. Skills run with full agent permissions.
- Add one: read its files first (especially any scripts), then
  `npx skills add <owner/repo> -s <skill-name> -a claude-code codex antigravity --copy -y`,
  add a row to the table above, and note it in your session log.
- `--copy` is deliberate: Windows symlinks need Developer Mode and break in git checkouts. Never hand-edit one copy; both folders must stay identical.

---

## 13. Milestones

v0.1 ships on Windows after ~10 weeks at 10–20 h/week. Every milestone ends with an app that runs. **A milestone is done only when every box in its checklist (design doc, "Milestones") is ticked, its phase doc is written, and its logs are summarised. Don't start the next one early.**

| | Milestone | Done means |
| --- | --- | --- |
| M0 | Setup | `npm run tauri dev` opens an empty window; CI runs the gate; docs/ and memory exist |
| M1 | Chat with one cloud model | Streamed reply from one OpenAI-compatible provider; Stop works; code blocks with copy; adapter tests (success, 401, 429, dropped stream) |
| M2 | Model Hub | Add/test/delete connections; keys in Credential Manager only; Anthropic adapter; every error kind shown clearly |
| M3 | Ollama | Detect + start; local models in picker; download with progress + cancel; delete with confirm; Free memory |
| M4 | History and settings | Chats survive restart; per-message `model_ref`; default model, theme, keep_alive settings |
| M5 | v0.1 release | Idle RAM < 150 MB measured; CI-built Windows installer on GitHub Releases; auto-update tested; tested on 8 GB RAM machine |

Test machines: dev laptop (RTX 3050 Ti 4 GB VRAM, 24 GB RAM) and one 8 GB RAM machine or VM.

---

## 14. Open questions (ask the human; don't decide silently)

- Repository name (app name decided in `docs/decisions/0003-app-name.md`; the acronym expansion stays open)
- v0.1 for Windows only, or all three OSes?
- Link to the Ollama installer, or download and run it from inside the app?
- Chat export format: Markdown, JSON, or both?
- Open source from day one? If yes, MIT or Apache-2.0?

When one is answered, write a decision record and remove it from this list.
