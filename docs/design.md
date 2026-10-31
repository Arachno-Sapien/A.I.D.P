# A.I.D.P: Design Doc

Oct 29, 2026 · @Syed Junaid · revised the same day by decision 0005 (coding workspace moves into v1)

## Overview

Version 1 is a Tauri desktop app where one person connects cloud models with their own API keys and local Ollama models, then chats with them and works on code with them from one place. Everything runs on the user's computer: no server, no accounts, no monthly bill.

The coding workspace is the main goal. It sits on top of the model layer, so the chat and provider work comes first (see Milestones).

**Goals for v1**

- A coding workspace: open a folder, edit files with an AI that can see the code, and let it change files or run commands only with the user's approval.
- One model picker that lists cloud and local models together, with clear status for each.
- API keys stored only in the operating system's keychain and sent only to their own provider.
- Full Ollama control from inside the app: detect, start, list, download, delete, and unload models.
- A light app that leaves memory for local models. Target: under 150 MB of RAM at idle with no model loaded and no folder open.
- Windows, macOS and Linux in v0.1 (decision 0016). Windows is the development machine and is tested first.

**Not in v1**

- Practice area, browser automation, or an MCP client (see the last section). Built-in agent tools are in v1 (M4); MCP is not.
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
| Long lists | @tanstack/react-virtual | Renders only the messages and file-tree rows on screen |
| Code editor (M3) | CodeMirror 6 | Modular, small bundle, low memory. Monaco (VS Code's editor) is several MB and runs web workers, which works against the RAM target |
| Diff view (M3) | @codemirror/merge | Same editor; shows AI edits with Accept and Reject |
| File walking and search (M3) | `ignore` crate | The walker ripgrep uses; respects .gitignore |
| Terminal (M4) | xterm.js + `portable-pty` | xterm.js draws the terminal; portable-pty runs the shell through Windows ConPTY (Unix PTYs later) |
| Tests | cargo test + wiremock, Vitest | Fake provider servers for adapter tests |
| Builds | GitHub Actions + tauri-action | Windows, macOS, Linux installers from one push |
| Updates (M6) | tauri-plugin-updater (native-tls), driven from Rust | Signed updates from GitHub Releases; no plugin permission reaches the window |

## Architecture

The React window talks only to the Rust core. The core holds the keys, makes every network call, manages Ollama, saves chats, and does every file read, file write, and command run in the workspace.

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
    ) -> Result<Reply, ProviderError>;
}
```

**Adapters in v1**

| Adapter | Covers | Notes |
| --- | --- | --- |
| OpenAI-compatible | OpenAI, OpenRouter, Groq, DeepSeek, Gemini (compat endpoint), LM Studio, any custom endpoint | One adapter, configured by base URL + key + model |
| Anthropic | Claude models | System prompt sits outside the message list; different stream events |
| Ollama native | Local Ollama models | Uses /api/chat so the app can set context length (num\_ctx) and keep\_alive per request |

**Streaming and stopping**

- Rust sends tokens and events to the UI through a Tauri Channel as `ChatEvent::Delta(text)`, `ToolCall`, and `ToolResult`, then one `Done(usage)` or `Error(kind)`. Within one message the loop sends each provider's assistant message back unchanged.
- The Stop button cancels the token. The adapter drops the HTTP stream and saves the partial reply with status `stopped`.

**Normalized errors.** Every adapter maps provider responses into one list, so the UI shows the same message everywhere:

- `InvalidKey` (401, 403)
- `RateLimited` (429, with retry time when the provider sends one)
- `ModelNotFound` (cloud model removed, or local model not downloaded)
- `ContextTooLong`
- `Offline` (no internet, or Ollama not running)
- `ProviderError` (5xx and anything unexpected)
- `Cancelled`

**Capabilities per model.** Each model record stores streaming, tool calling, vision, and context window as yes / no / unknown. Fill them from the provider where it reports them (Ollama's /api/show does for local models); otherwise the user can set them. Agent tools (M4) only appear for models that support tool calling; the rest get the M3 workspace.

**Leave room for later.** Store message content as a list of parts (text now, tool calls from M4, images later), and keep `ChatEvent` open for the `ToolCall` event M4 adds. This makes MCP support after v1 an addition, not a rewrite.

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

## Coding workspace

The coding workspace is the main goal of A.I.D.P (decision 0005). It uses the model layer above, so it comes after M1 and M2, in two milestones.

**M3: editor with an AI panel**

- Open a folder. The file tree respects `.gitignore` and stays responsive on a large repo: rows are virtualized and folders load when expanded.
- Edit files in tabs with CodeMirror 6: syntax highlighting, unsaved-change markers, save. Before saving, Rust checks the file's modified time and warns if something else changed it.
- An AI panel beside the editor. A message can carry the open file and the current selection as context, shown as chips the user can remove. Replies stream with Stop through the same `ChatEvent` channel as Chat.
- "Apply" on a code block in a reply opens a diff against the open file or selection. The file changes only when the user clicks Accept.
- No tool calling yet, so M3 works with every model.

**M4: agent tools and terminal**

- Tool calling in the OpenAI-compatible and Anthropic adapters through a new `ChatEvent::ToolCall`. Ollama gets it for models that support tools.
- Built-in tools only (MCP stays after v1): `list_files`, `read_file`, `search` (text search that respects .gitignore), `edit_file` (replace an exact piece of text), `create_file`, and `run_command`.
- Read-only tools run inside the folder without asking. `edit_file` and `create_file` show a diff and wait for Accept. `run_command` asks every time.
- A terminal panel at the bottom of the workspace runs the user's own shell in the folder. Commands the user types there are the user's; only commands the model asks for need approval.
- Models whose capability says no tool calling get the M3 workspace only.

**Where the code lives**

| Folder | Job |
| --- | --- |
| `src/features/workspace/` | File tree, editor tabs, AI panel, diff view, approval prompts, terminal panel |
| `src-tauri/src/workspace/` | Open a folder, path checks, list, read, and write files, secret-file filter |
| `src-tauri/src/tools/` | Tool definitions, the tool-call loop, approvals, command runner, terminal PTY |

All file and process access is in Rust. The UI never hands a filesystem path to the OS, and the Tauri fs and shell plugins stay off.

**Memory.** The 150 MB idle target applies with no folder open. An editor and a terminal cost more, so M3 measures RAM with a mid-sized repo open and records a workspace budget in its phase doc, and M4 does the same with the terminal running.

## Workspace and tool security

Once a model can read files and run commands, a mistake costs more than a leaked key. These rules go into AGENTS.md word for word, next to the key rules.

1. **One folder.** The workspace is the folder the user opened. Rust resolves every path, following symlinks, and refuses anything that lands outside it, including `..` and absolute paths.
2. **Files and processes go through Rust.** The UI uses workspace commands only. The Tauri fs and shell plugins stay off.
3. **Edits are proposals.** AI changes appear as a diff and reach the disk only when the user accepts them.
4. **Every model command is approved.** The user sees the exact command and working directory before it runs. There is no auto-approve in v1. Commands run inside the folder, with a timeout and a Stop button.
5. **Tool output is data.** File contents and command output returned to the model are untrusted. Instructions inside them never skip an approval.
6. **Secrets stay out of prompts.** Files that look like secrets (`.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.ppk`, `*.tfvars`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, `.git-credentials`) are skipped by `list_files`, `read_file`, and `search`; files containing a private key (a `-----BEGIN ... PRIVATE KEY-----` or `-----BEGIN ... PRIVATE KEY BLOCK-----` block, or a PuTTY key) are skipped by `read_file` and `search`. Neither is ever sent as context unless the user adds it by hand. Paths inside the `.git` folder are refused by every workspace command and tool, because its config can hold credentials and its hooks run code.
7. **Warn without git.** If the folder isn't a git repository, warn before the first AI edit, because there is no easy undo.

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

Five SQLite tables in one local file, read and written only by Rust. No table ever holds a full API key. All record IDs, foreign keys, and epoch timestamps are `u32` across the IPC boundary to ensure safe serialization without JavaScript `BigInt` precision loss. Note that in M2, the `models` table has only the columns M2 uses (`id`, `connection_id`, `model_id`, `display_name`, `context_window`, `is_default`); M4 migration 3 adds `supports_tools` (`supports_vision` waits until something uses it). The `settings` table arrives in M3 (`key, value` text columns, migration 2, storing recent workspaces).

| Table | Holds | Key columns |
| --- | --- | --- |
| connections | One row per provider setup | id, kind (openai\_compat / anthropic / ollama), label, base\_url, key\_hint (last 4), last\_tested\_at, last\_test\_ok |
| models | Models the user chose to show | id, connection\_id, model\_id, display\_name, context\_window, supports\_tools, num\_ctx, is\_default, hidden |
| conversations | One row per chat | id, title, workspace\_path (null for plain chats), created\_at, updated\_at |
| messages | Every message in a chat | id, conversation\_id, role, content\_parts (JSON: text, chips, target, tool\_call and tool\_result), model\_name, model\_ref, status (complete / stopped / error), error\_kind, tokens\_in, tokens\_out, created\_at |
| settings | App preferences | key, value (theme, default model, keep\_alive, recent workspaces) |

Each message stores its own `model_ref` and `model_name`, so switching models in the middle of a chat keeps a correct record of who said what. A workspace's AI panel is a conversation with `workspace_path` set. Schema changes go through numbered migrations from day one.

## Screens and user flows

Four screens: Chat, Workspace, Models, and Settings. A first-time user lands on an empty Chat screen with one button: Add a model. After that, the app reopens where the user left off.

**Workspace**

- Left: file tree for the open folder, with Open folder and a recent-folders list.
- Centre: editor tabs.
- Right: AI panel with the model picker, context chips (open file, selection), and the same message list and composer as Chat.
- Bottom (M4): terminal panel.
- The file tree and the AI panel can be hidden (Files and AI buttons, `Ctrl+B` and `Ctrl+Alt+B`) and resized by dragging the line beside them; they shrink before the editor does, and the AI panel reopens when a command waits for approval (M6).
- Every AI edit opens a diff over the editor with Accept and Reject.
- Every command the model wants to run opens an approval prompt showing the command and folder, with Run and Deny.

**Chat**

- Left sidebar: conversation list with search and new chat.
- Top: model picker, grouped into Cloud and Local, with a status dot per model. Unavailable models stay visible but greyed out, with the reason (key invalid, Ollama stopped, model not downloaded).
- Messages with Markdown and code blocks (copy button on each). Long chats render only what is on screen.
- Composer with Send and Stop. A stopped or failed reply stays in the chat with its status.

**Models**

- Connections list: provider, label, masked key, last test result, Test and Delete buttons.
- Local panel: Ollama status, downloaded models with size, which ones are loaded in memory, Download / Delete / Free memory.

**Settings:** theme, default model, keep\_alive, chat history location, export all chats. Updates (M6): the version, **Check for updates at start**, and **Check for updates**; a found update shows a bar under the header with **Install and restart** and **Later**.

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

**Flow: work on code with AI**

1. Workspace → Open folder. The tree loads. If the folder isn't a git repository, a banner says AI edits can't be undone easily.
2. Open a file, select some code, and ask in the AI panel.
3. The reply streams in. Apply on a code block opens the diff.
4. Accept writes the file; Reject leaves it untouched.
5. From M4, the model can also list, read, and search files on its own, propose edits as diffs, and ask to run commands such as the tests, each with an approval prompt.

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
    features/workspace/    file tree, editor, AI panel, diffs, approvals, terminal
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
        http.rs            shared HTTP helpers and SSE line reader
        url.rs             base URL check and transport classification
        openai_compat.rs
        anthropic.rs
        ollama_chat.rs
      ollama/              detect, start, pull, ps, delete, unload
      workspace/           open folder, path checks, file read/write, secret filter
      tools/               tool definitions, tool-call loop, approvals, commands, PTY
      connections.rs       connection and model orchestration service
      secrets.rs           keychain wrapper, the only file that touches keys
      db/
        mod.rs             schema, numbered migrations, SQLite connection
        connections.rs     queries for connections and models tables
    tests/                 adapter tests against wiremock fake servers
  docs/
    design.md              this document, exported
    setup.md
    security.md
    user-guide.md
    phases/                M0.md to M6.md
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
- The seven key security rules and the seven workspace and tool security rules, word for word.
- The commands to build, test, and run the app, plus the documentation and memory rules from the next section.
- A "never" list: no `unwrap()` outside tests, no new dependency without a stated reason, no editing `bindings.ts` by hand, no command that returns a key.

**Review checklist for every change**

- [ ] Does any command now return or log a key or a request header?
- [ ] Was a new Tauri permission or plugin added? Why?
- [ ] Any new dependency? Is it widely used and maintained?
- [ ] Any `unwrap()` or `expect()` in non-test code?
- [ ] Can any path or command reach outside the opened folder, or run without the user's approval?
- [ ] Did the agent update tests, docs, and its memory log?
- [ ] Does the app still start and stream a reply?

## Documentation and agent memory

Agents write the docs as they build, and every agent session leaves a short log in a shared memory folder. The next agent, or you weeks later, picks up exactly where the last one stopped.

**Docs the agent keeps**

| Doc | Location | Written or updated when |
| --- | --- | --- |
| Design doc | docs/design.md | Exported from this doc in M0; updated whenever a design decision changes |
| Setup guide | docs/setup.md | M0, then whenever a tool, version, or setup step changes. It must take a fresh Windows machine to a running app |
| Phase docs | docs/phases/M0.md to M6.md | Start of each milestone (the plan) and end of it (what was built, what changed from the plan, what's left) |
| Decision records | docs/decisions/0001-use-tauri.md, and so on | Whenever a choice is made between real alternatives. One page: context, options, choice, why |
| Developer guide | docs/dev/ | When a task repeats: adding an adapter, adding a Tauri command, running tests, making a release |
| Security notes | docs/security.md | M2, then with any change to key handling, permissions, network calls, file access, or command running |
| Changelog | CHANGELOG.md | Every user-visible change, grouped by version |
| User guide | docs/user-guide.md | M6: install, add a model, open a folder, connect Ollama, troubleshooting |

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

Decision 0005 moved the coding workspace into v1, which adds two milestones. Rough estimate: v0.1 ships on Windows, macOS and Linux (decision 0016) after about 16 weeks at 10 to 20 hours a week, plus 2 buffer weeks for exams. Revisit the estimate in each phase doc. Every milestone ends with an app that runs.

&#91;embedded content: roadmap · original 6-milestone plan; the list below replaces it\]

Each milestone is done only when every box below is ticked, its phase doc is written, and its session logs are summarised. Don't start the next one early.

**M0 Setup**

- [x] `npm run tauri dev` opens an empty window on Windows
- [x] CI runs clippy, tests, and typecheck on every push
- [x] AGENTS.md holds the stack, folder, security, documentation, and memory rules; docs/ and .ai/memory/ exist with templates
- [x] Rust book chapters 1 to 9 read

**M1 Chat with one cloud model**

- [x] Type a message and get a streamed reply from one OpenAI-compatible provider
- [x] Stop cancels a reply midway
- [x] Code blocks render with a copy button
- [x] Adapter tests cover success, 401, 429, and a dropped stream

For M1 only, the key comes from a git-ignored local config file. M2 replaces it with the keychain.

**M2 Keys and providers**

- [x] Add, test, and delete cloud connections from the Models page
- [x] Keys saved in Windows Credential Manager, never in SQLite
- [x] Anthropic adapter streams replies
- [x] Every error kind shows a clear message in the UI

**M3 Coding workspace**

- [x] Open a folder; the file tree respects .gitignore and stays responsive on a 10,000-file folder
- [x] Open, edit, and save files in CodeMirror 6 tabs, with unsaved changes marked
- [x] The AI panel sends the open file and selection as context, streams replies, and Stop works
- [x] Apply shows a diff; the file changes only after Accept
- [x] Tests prove that `..`, absolute paths, and symlinks pointing outside the folder are refused
- [x] A warning appears before the first AI edit in a folder without git
- [x] RAM with a mid-sized repo open is measured and the workspace budget recorded in the phase doc (127 MB idle, 155 MB measured, budget 200 MB; see docs/phases/M3.md)

**M4 Agent tools and terminal**

- [x] `ChatEvent::ToolCall` and tool calling in the OpenAI-compatible and Anthropic adapters
- [x] `list_files`, `read_file`, `search`, `edit_file`, `create_file`, and `run_command` work inside the folder
- [x] Every edit shows a diff first; every model command asks first; no auto-approve
- [x] Secret-looking files are never read or sent unless the user adds them by hand
- [x] The terminal panel runs the user's shell in the folder; model commands have a timeout and Stop
- [x] Fake-provider tests: a model asking for a path outside the folder is refused, and a denied command never runs
- [x] Models without tool calling still get the M3 workspace

**M5 Ollama, history, and settings**

- [x] App detects Ollama and starts it if stopped
- [x] Downloaded models appear in the picker and work in Chat and the workspace
- [x] Download with progress and cancel; delete with confirmation; Free memory unloads the model
- [x] Chats survive an app restart, and each message records its model
- [x] Settings for default model, theme, and keep\_alive work

**M6 v0.1 release**

- [ ] Idle RAM (no folder open) under 150 MB; workspace RAM within the budget set in M3 and M4
- [ ] Installers for Windows, macOS and Linux built by CI and published as a GitHub release
- [ ] Auto-update tested from one version to the next
- [ ] Tested on an 8 GB RAM machine with a real project folder open

## Risks and open questions

The biggest risk is an agent-built Rust core you can't debug; the plan answers it with Rust reading skills, small tasks, and tests.

| Risk | What happens | Fallback |
| --- | --- | --- |
| Can't debug agent-written Rust | Progress stalls on one error for days | Rust basics in week 1, small tasks, tests with every change |
| Key leaks through logs or IPC | User's paid key exposed | Secret type, no command returns keys, review checklist |
| Exams and coursework | Milestones slip | Two buffer weeks; each milestone ends in a working app |
| Linux keyring missing | Keys can't be saved | Clear error naming GNOME Keyring or KWallet; never a plain-text fallback |
| WebView differences across OSes | UI looks or behaves differently | Windows first; macOS and Linux tested before v0.1 ships |
| Unsigned installer | Windows shows an "unknown publisher" warning; macOS blocks the first open | Document how to proceed (user guide, decision 0017); sign once the app has users |
| Provider API changes | An adapter breaks | Fake-server tests catch it; adapters are isolated files |
| Small local models handle tools poorly | Agent tools don't work with them | Capability flags limit those models to the M3 workspace |
| An AI edit damages files | User loses work | Every edit is a diff the user accepts; warning in folders without git |
| The model runs a harmful command | Files deleted or data sent somewhere | Every model command needs approval; no auto-approve; runs inside the folder with a timeout |
| A file or command output tells the model to do something (prompt injection) | The model tries to read secrets or run commands | Tool output is treated as data; approvals still apply; secret-looking files are skipped |
| Editor and terminal push RAM up | The app competes with local models for memory | CodeMirror 6 over Monaco; lazy file tree; budgets measured in M3 and M4 |

**Open questions**

- [x] App name: A.I.D.P (decision 0003). Repository: https://github.com/Arachno-Sapien/A.I.D.P
- [x] v0.1 on Windows, macOS and Linux (decision 0016)
- [x] Link to the Ollama installer, or download and run it from inside the app? Link to installer on ollama.com; the app starts it if stopped (decision 0013)
- [ ] Chat export format: Markdown, JSON, or both?
- [x] Open source from day one: yes, MIT OR Apache-2.0 (decision 0004)
- [ ] After v0.1: allow "approve this command for the session" for repeat commands like the test runner?

## Later

These wait until v1 ships. The model layer is designed so each one is an addition, not a rewrite.

- **MCP client.** Lets the model use external tool servers on top of the built-in tools from M4.
- **Browser checks with Playwright.** Connect Microsoft's Playwright MCP server as a sidecar. Offered only for models with tool calling (and ideally vision). The browser starts on demand and closes after, to save memory.
- **Practice area.** LeetCode-style problems with hidden test cases and an AI tutor that uses the user's chosen model. Code runs either in local language runtimes or through a sandbox service like Judge0.
