# Desktop AI Model App: Design Doc

Oct 29, 2026 · @Syed Junaid

## Overview

Version 1 is a Tauri desktop app where one person connects cloud models with their own API keys and local Ollama models, then chats with any of them from one place. Everything runs on the user's computer: no server, no accounts, no monthly bill.

**Goals for v1**

- One model picker that lists cloud and local models together, with clear status for each.
- API keys stored only in the operating system's keychain and sent only to their own provider.
- Full Ollama control from inside the app: detect, start, list, download, delete, and unload models.
- A light app that leaves memory for local models. Target: under 150 MB of RAM at idle with no model loaded.
- Windows first (the development machine), then macOS and Linux.

**Not in v1**

- Practice area, coding workspace, browser automation, or MCP tools (see the last section).
- User accounts or sync between devices.
- A built-in inference engine. Ollama runs the models.
- Mobile apps.

## Tech stack

Tauri 2 with a React frontend and a Rust core. Every choice below favours low memory use and tools that coding agents already know well.

| Layer | Choice | Why |
| --- | --- | --- |
| App shell | Tauri 2 | Uses the system's built-in browser engine, small installer, low idle RAM |
| Frontend | React + TypeScript + Vite | Standard setup, agents write it reliably |
| Styling | Tailwind CSS | No heavy component library to ship |
| UI state | Zustand | Tiny, simple store |
| Typed IPC | tauri-specta | Generates TypeScript types from Rust commands, so both sides stay in sync |
| HTTP + async | reqwest + tokio | Streaming responses, the Rust standard |
| Key storage | keyring crate | Windows Credential Manager, macOS Keychain, Linux Secret Service |
| Secret handling | secrecy crate | Wraps keys so they print as \[REDACTED\] in logs |
| Database | SQLite via rusqlite | One local file, accessed only from Rust |
| Markdown | react-markdown + a light highlighter (Prism) | Renders model replies safely, no raw HTML |
| Long lists | @tanstack/react-virtual | Renders only the messages on screen |
| Tests | cargo test + wiremock, Vitest | Fake provider servers for adapter tests |
| Builds | GitHub Actions + tauri-action | Windows, macOS, Linux installers from one push |

## Architecture

The React window talks only to the Rust core. The core holds the keys, makes every network call, manages Ollama, and saves chats.

&#91;embedded content: architecture · UI, Rust core, and what the core talks to\]

The UI sends commands and receives a stream of tokens back. Nothing in the window can reach a key, a provider, or the disk directly, so a bug in the UI can't leak a key.

## Model layer

All chat goes through one Rust trait with three adapters. The UI never knows which provider it is talking to.

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

**Adapters in v1**

| Adapter | Covers | Notes |
| --- | --- | --- |
| OpenAI-compatible | OpenAI, OpenRouter, Groq, DeepSeek, Gemini (compat endpoint), LM Studio, any custom endpoint | One adapter, configured by base URL + key + model |
| Anthropic | Claude models | System prompt sits outside the message list; different stream events |
| Ollama native | Local Ollama models | Uses /api/chat so the app can set context length (num\_ctx) and keep\_alive per request |

**Streaming and stopping**

- Rust sends tokens to the UI through a Tauri Channel as `ChatEvent::Delta(text)`, then one `Done(usage)` or `Error(kind)`.
- The Stop button cancels the token. The adapter drops the HTTP stream and saves the partial reply with status `stopped`.

**Normalized errors.** Every adapter maps provider responses into one list, so the UI shows the same message everywhere:

- `InvalidKey` (401, 403)
- `RateLimited` (429, with retry time when the provider sends one)
- `ModelNotFound` (cloud model removed, or local model not downloaded)
- `ContextTooLong`
- `Offline` (no internet, or Ollama not running)
- `ProviderError` (5xx and anything unexpected)
- `Cancelled`

**Capabilities per model.** Each model record stores streaming, tool calling, vision, and context window as yes / no / unknown. Fill them from the provider where it reports them (Ollama's /api/show does for local models); otherwise the user can set them. Later features, like browser checks, only appear for models that support them.

**Leave room for later.** Store message content as a list of parts (text now, images and tool calls later), and keep `ChatEvent` open for a future `ToolCall` event. This makes MCP support an addition, not a rewrite.

## API key security

A key enters the app once, goes straight into the OS keychain, and is only ever read by Rust when calling its own provider. These rules go into AGENTS.md word for word.

1. **Keychain only.** Keys live in the OS keychain through the keyring crate, one entry per connection. SQLite stores only the connection details and the last 4 characters.
2. **One way in, no way out.** The UI sends the key once in `add_connection`. Rust tests it, saves it, and returns the masked form. No command ever returns a full key.
3. **Never logged.** Keys are held in a `Secret` type from the secrecy crate, which prints as \[REDACTED\]. Never log request headers.
4. **HTTPS for cloud.** Plain http is allowed only for localhost or a local network address, with a visible warning.
5. **Locked-down app.** Expose only the app's own commands through Tauri's capability files. Turn off unused plugins, set a strict content security policy, and never load remote web pages in the app window.
6. **Safe rendering.** Model replies render as Markdown with raw HTML turned off, so a reply can't inject scripts into the app.
7. **Clean delete.** Removing a connection also deletes its keychain entry.

On Linux, the keyring needs a Secret Service (GNOME Keyring or KWallet). If none is found, show a clear error instead of falling back to plain-text storage.

## Local models (Ollama)

The Rust core talks to Ollama at 127.0.0.1:11434 directly, so there is no CORS setup and no browser permission prompt. The user never edits an environment variable.

| Task | Ollama endpoint | What the app does |
| --- | --- | --- |
| Detect | GET /api/version | Runs on app start and when the Models page opens |
| Start | (runs `ollama serve`) | If installed but not running, a Start button launches it |
| List downloaded | GET /api/tags | Fills the Local section of the model picker |
| Model details | POST /api/show | Context length, size, quantization, capabilities |
| Loaded now | GET /api/ps | Shows which models sit in memory and how much they use |
| Download | POST /api/pull | Streams progress into a progress bar, with Cancel |
| Delete | DELETE /api/delete | Asks for confirmation first |
| Unload | chat request with keep\_alive 0 | The "Free memory" button |

**Connection states the UI must show:** not installed (link to the Ollama download page), installed but stopped (Start button), running with no models (suggest a first download), running and ready.

**Memory rules**

- Show the download size before every pull, and warn when a model is likely too large for the machine.
- Let the user set keep\_alive (how long a model stays loaded after use). Default to Ollama's own default.
- Set context length per model. Bigger context uses more memory, so start conservative and explain the trade-off in the UI.

**Test machines:** the development laptop (RTX 3050 Ti with 4 GB VRAM, 24 GB RAM), plus one 8 GB RAM machine or VM to check the app stays usable on low-end hardware.

Other local servers (LM Studio, llama.cpp) connect through the OpenAI-compatible adapter as custom endpoints. Only Ollama gets the full management panel in v1.

## Data model

Five SQLite tables in one local file, read and written only by Rust. No table ever holds a full API key.

| Table | Holds | Key columns |
| --- | --- | --- |
| connections | One row per provider setup | id, kind (openai\_compat / anthropic / ollama), label, base\_url, key\_hint (last 4), last\_tested\_at, last\_test\_ok |
| models | Models the user chose to show | id, connection\_id, model\_id, display\_name, context\_window, supports\_tools, supports\_vision, is\_default, hidden |
| conversations | One row per chat | id, title, model\_ref, system\_prompt, created\_at, updated\_at |
| messages | Every message in a chat | id, conversation\_id, role, content\_parts (JSON), model\_ref, status (complete / stopped / error), error\_kind, tokens\_in, tokens\_out, created\_at |
| settings | App preferences | key, value (theme, default model, keep\_alive, history location) |

Each message stores its own `model_ref`, so switching models in the middle of a chat keeps a correct record of who said what. Schema changes go through numbered migrations from day one.

## Screens and user flows

Three screens: Chat, Models, and Settings. A first-time user lands on an empty Chat screen with one button: Add a model.

**Chat**

- Left sidebar: conversation list with search and new chat.
- Top: model picker, grouped into Cloud and Local, with a status dot per model. Unavailable models stay visible but greyed out, with the reason (key invalid, Ollama stopped, model not downloaded).
- Messages with Markdown and code blocks (copy button on each). Long chats render only what is on screen.
- Composer with Send and Stop. A stopped or failed reply stays in the chat with its status.

**Models**

- Connections list: provider, label, masked key, last test result, Test and Delete buttons.
- Local panel: Ollama status, downloaded models with size, which ones are loaded in memory, Download / Delete / Free memory.

**Settings:** theme, default model, keep\_alive, chat history location, export all chats.

**Flow: add a cloud model**

1. Models → Add connection → pick a provider (or Custom endpoint).
2. Paste the key (and base URL for custom).
3. The app tests it by listing models. A failed test shows the normalized error and saves nothing.
4. The user ticks which models to show in the picker.
5. Saved. The key goes to the keychain; the UI only sees the masked form.

**Flow: connect Ollama**

1. The app checks for Ollama on start, with no user action needed.
2. Not installed → link to download. Installed but stopped → Start button.
3. Running → downloaded models appear in the picker automatically.
4. No models yet → suggest a small coding model with its download size, then show progress.

## Project structure

One repository, frontend in `src/`, Rust core in `src-tauri/`. Each Rust folder has one job, so an agent working on Ollama never needs to touch key storage.

```text
app/
  AGENTS.md                shared rules for AI agents
  CLAUDE.md                one line: @AGENTS.md
  CHANGELOG.md
  .ai/memory/              progress, known issues, session logs
  src/                     React frontend
    features/chat/
    features/models/
    features/settings/
    lib/bindings.ts        generated by tauri-specta, never edited by hand
  src-tauri/
    capabilities/          Tauri permission files
    src/
      main.rs
      commands/            thin Tauri commands, one file per area
      gateway/
        mod.rs             ModelProvider trait, ChatEvent, ProviderError
        openai_compat.rs
        anthropic.rs
        ollama_chat.rs
      ollama/              detect, start, pull, ps, delete, unload
      secrets.rs           keychain wrapper, the only file that touches keys
      db/                  schema, migrations, queries
    tests/                 adapter tests against wiremock fake servers
  docs/
    design.md              this document, exported
    setup.md
    security.md
    user-guide.md
    phases/                M0.md to M5.md
    decisions/             one page per decision
    dev/                   how-to guides for repeat tasks
```

## Building with AI agents

Agents can write all of this code, but you still need to judge what they wrote. The risk with zero Rust is not slow typing; it's being unable to tell when an agent is stuck in a loop, or when it quietly breaks a security rule.

**Learn just enough Rust (about 6 to 8 hours, during week 1).** Chapters 1 to 9 of The Rust Programming Language book: ownership and borrowing, `Result` and the `?` operator, enums and `match`, and reading compiler errors. The goal is reading code, not writing it. Rust's strict compiler is actually an advantage here: it catches many agent mistakes before the app even runs, as long as you can read what it says.

**Workflow for every task**

1. Pick one small task from the current milestone (a few hours of work at most).
2. Ask the agent for a plan first. Check it touches only the folders it should.
3. Let it write the code **and the tests** together.
4. Run the checks: `cargo clippy`, `cargo test`, `npm run typecheck`, `npx vitest run`.
5. Read the diff against the review checklist below, then commit. Git is your undo button, so commit often.

**What goes in AGENTS.md**

- The stack and folder rules from this doc.
- The seven key security rules, word for word.
- The commands to build, test, and run the app, plus the documentation and memory rules from the next section.
- A "never" list: no `unwrap()` outside tests, no new dependency without a stated reason, no editing `bindings.ts` by hand, no command that returns a key.

**Review checklist for every change**

- [ ] Does any command now return or log a key or a request header?
- [ ] Was a new Tauri permission or plugin added? Why?
- [ ] Any new dependency? Is it widely used and maintained?
- [ ] Any `unwrap()` or `expect()` in non-test code?
- [ ] Did the agent update tests, docs, and its memory log?
- [ ] Does the app still start and stream a reply?

## Documentation and agent memory

Agents write the docs as they build, and every agent session leaves a short log in a shared memory folder. The next agent, or you weeks later, picks up exactly where the last one stopped.

**Docs the agent keeps**

| Doc | Location | Written or updated when |
| --- | --- | --- |
| Design doc | docs/design.md | Exported from this doc in M0; updated whenever a design decision changes |
| Setup guide | docs/setup.md | M0, then whenever a tool, version, or setup step changes. It must take a fresh Windows machine to a running app |
| Phase docs | docs/phases/M0.md to M5.md | Start of each milestone (the plan) and end of it (what was built, what changed from the plan, what's left) |
| Decision records | docs/decisions/0001-use-tauri.md, and so on | Whenever a choice is made between real alternatives. One page: context, options, choice, why |
| Developer guide | docs/dev/ | When a task repeats: adding an adapter, adding a Tauri command, running tests, making a release |
| Security notes | docs/security.md | M2, then with any change to key handling, permissions, or network calls |
| Changelog | CHANGELOG.md | Every user-visible change, grouped by version |
| User guide | docs/user-guide.md | M5: install, add a model, connect Ollama, troubleshooting |

**Documentation rules**

1. Docs change in the same commit as the code they describe. A change that alters behaviour without updating its docs is not done.
2. Short and current beats long and stale. Delete outdated text instead of stacking notes on top of it.
3. Docs never contain real keys, tokens, or personal data. Use placeholders like `sk-...XXXX`.

**Agent memory folder**

`.ai/memory/` is committed to git, so every agent and every AI tool reads the same history. Shared rules live in `AGENTS.md`, a file several coding agents read by convention. `CLAUDE.md` holds a single line, `@AGENTS.md`, so Claude Code loads the same rules and nothing is written twice.

```text
AGENTS.md                  shared rules for every AI tool
CLAUDE.md                  one line: @AGENTS.md
.ai/
  memory/
    progress.md            current milestone: done, in progress, next 3 tasks
    known-issues.md        bugs, gotchas, approaches that failed (don't retry)
    log/
      2026-11-02-m1-streaming.md    one file per agent session
      archive/M0/          logs moved here once a milestone closes
```

Each session log follows the same template:

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

1. **Start of session:** read AGENTS.md, progress.md, known-issues.md, and the 3 newest log files before touching code.
2. **End of session:** write a new log file and update progress.md. Anything that wasted time goes into known-issues.md.
3. **Append-only logs.** Never edit an old log; correct it in a new one.
4. **Short entries.** Under about 30 lines: facts, file paths, decisions. No narration.
5. **Milestone close:** summarise that milestone's logs into its phase doc, then move them to `log/archive/`.
6. **No secrets.** Never write keys, tokens, or personal data into any memory file.

## Milestones

v0.1 ships on Windows after about 10 weeks at 10 to 20 hours a week, with 2 buffer weeks for exams. Every milestone ends with an app that runs.

&#91;embedded content: roadmap · 6 milestones at 10 to 20 hours a week\]

Each milestone is done only when every box below is ticked, its phase doc is written, and its session logs are summarised. Don't start the next one early.

**M0 Setup**

- [ ] `npm run tauri dev` opens an empty window on Windows
- [ ] CI runs clippy, tests, and typecheck on every push
- [ ] AGENTS.md holds the stack, folder, security, documentation, and memory rules; docs/ and .ai/memory/ exist with templates
- [ ] Rust book chapters 1 to 9 read

**M1 Chat with one cloud model**

- [ ] Type a message and get a streamed reply from one OpenAI-compatible provider
- [ ] Stop cancels a reply midway
- [ ] Code blocks render with a copy button
- [ ] Adapter tests cover success, 401, 429, and a dropped stream

For M1 only, the key comes from a git-ignored local config file. M2 replaces it with the keychain.

**M2 Model Hub**

- [ ] Add, test, and delete connections from the Models page
- [ ] Keys saved in Windows Credential Manager, never in SQLite
- [ ] Anthropic adapter streams replies
- [ ] Every error kind shows a clear message in the UI

**M3 Ollama**

- [ ] App detects Ollama and starts it if stopped
- [ ] Downloaded models appear in the picker and chat works
- [ ] Download with progress and cancel; delete with confirmation
- [ ] Free memory unloads the model

**M4 History and settings**

- [ ] Chats survive an app restart
- [ ] Switching models mid-chat records the model on each message
- [ ] Settings for default model, theme, and keep\_alive work

**M5 v0.1 release**

- [ ] Idle RAM measured and under the 150 MB target
- [ ] Windows installer built by CI and published as a GitHub release
- [ ] Auto-update tested from one version to the next
- [ ] Tested on an 8 GB RAM machine

## Risks and open questions

The biggest risk is an agent-built Rust core you can't debug; the plan answers it with Rust reading skills, small tasks, and tests.

| Risk | What happens | Fallback |
| --- | --- | --- |
| Can't debug agent-written Rust | Progress stalls on one error for days | Rust basics in week 1, small tasks, tests with every change |
| Key leaks through logs or IPC | User's paid key exposed | Secret type, no command returns keys, review checklist |
| Exams and coursework | Milestones slip | Two buffer weeks; each milestone ends in a working app |
| Linux keyring missing | Keys can't be saved | Clear error; Linux ships after Windows |
| WebView differences across OSes | UI looks or behaves differently | Windows first; test macOS and Linux before their release |
| Unsigned installer | Windows shows an "unknown publisher" warning | Document how to proceed; sign once the app has users |
| Provider API changes | An adapter breaks | Fake-server tests catch it; adapters are isolated files |
| Small local models handle tools poorly | Later features don't work with them | Capability flags hide those features per model |

**Open questions**

- [ ] App name and repository name
- [ ] v0.1 for Windows only, or all three OSes?
- [ ] Link to the Ollama installer, or download and run it from inside the app?
- [ ] Chat export format: Markdown, JSON, or both?
- [ ] Open source from day one? If yes, which license (MIT or Apache-2.0)?

## Later

These wait until v1 ships. The model layer is designed so each one is an addition, not a rewrite.

- **MCP client and tool calling.** Adds a `ToolCall` event to the model layer. Opens the door to many tools at once.
- **Browser checks with Playwright.** Connect Microsoft's Playwright MCP server as a sidecar. Offered only for models with tool calling (and ideally vision). The browser starts on demand and closes after, to save memory.
- **Practice area.** LeetCode-style problems with hidden test cases and an AI tutor that uses the user's chosen model. Code runs either in local language runtimes or through a sandbox service like Judge0.
- **Coding workspace.** File explorer, editor, and terminal. The largest of these, so it comes last.
