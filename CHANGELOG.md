# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Reads images:** each chosen cloud model on the Models screen has a Yes / No / Not sure setting. Set it to Yes for a vision model (Claude, GPT-4o) and it gets Browser checks screenshots; No refuses image attachments before sending (decision 0031).
- **Screenshots on browser cards:** a Browser checks screenshot shows on its card, and a model that reads images (a local vision model) gets it too; other models get its text only. Saved chats keep the text, not the image. Re-add the Browser checks server from the preset to get screenshots (decision 0031).
- **Servers the agent starts:** the agent can start a dev server that keeps running (`start_server`, asked like any command), read its output and stop it, so Browser checks no longer need you to start the server (decision 0030).
- **Always allow:** a Run card can remember that exact command for the folder, so it runs without asking next time. Settings lists them with Remove (decision 0030).
- **Run commands without asking:** a switch beside Review at end lets the agent's commands run for one task without the Run button (it asks you first, shows every command on a card, and turns itself off when the task ends; decision 0030).
- **Review at end:** A switch next to **Agent** in the Workspace. With it on, the agent writes its edits and new files as it works instead of stopping at each one, so it can test what it built; when it finishes, a card lists every changed file with its diff and **Undo**, **Undo all** or **Keep all**. Commands and outside tools still ask every time. Off by default; asks first in a folder without git (decision 0028).
- **Outside tools (MCP):** Add, test, turn on/off, and remove stdio MCP servers under **Settings → Outside tools (MCP)** (`mcp_servers`, migration 7; decisions 0025–0026). Enabled servers expose tools (`mcp__<server>__<tool>`) to the Workspace agent with every call shown on a step card for explicit **Run** / **Deny** approval before running.
- **Browser checks (Playwright):** One-click preset in Settings (`@playwright/mcp@0.0.85`, isolated, `localhost`/`127.0.0.1` origins; decision 0027) so the Workspace agent can inspect locally running web apps with your approval.

- **Run without asking:** a switch on each outside tool server in Settings, off by default. With it on, the agent calls that server's tools (for example every browser click) without Run or Deny; each call still shows on a card. Turning it on asks first. Commands still ask every time (decision 0029).

### Fixed
- **AI panel options:** in a narrow panel, Agent, Review at end, Run commands without asking and the no-git note wrap onto their own row instead of covering the model picker, and the "Run commands without asking?" dialog opens over the whole window instead of clipped inside the panel.
- **Browser checks:** the agent no longer loops trying to start a web server, which every command's end stops. With outside tools on, it now asks you to start your server in the workspace terminal and give it the address.
- **Outside tools:** the agent is told its outside tools are already running, so asked to "install the Playwright MCP" it uses the browser tools instead of setting one up in your folder.
- **Outside tools:** a server is no longer stopped as idle in the middle of an agent run (a long run of commands could take it away, and later calls failed with "no such tool").
- **Stop** now works while Ollama is still loading a local model into memory. Before, it did nothing until the first word arrived.
- A chat no longer pulls you back to the bottom while a reply is being written. Scroll up to read and it stays there; scroll back to the end (or send a message) and it follows again.
- Double-clicking a file in the workspace tree no longer opens it in two tabs.
- Saving twice in quick succession (holding `Ctrl+S`) no longer reports "This file changed on disk".
- A chat that couldn't be deleted stays in the list instead of vanishing until the next start.
- Sending a message that has only attachments can no longer post it twice.
- A wide table in a reply scrolls inside its message, and a long unbroken word or link wraps, instead of running past the edge.
- **Copy** on a code block no longer says "Copied" when the clipboard refused.

### Changed
- **Browser checks:** the preset opens a Chromium window you can watch instead of a hidden browser. Remove and re-add an existing `browser` server to get it.
- The message box grows as you type, up to a few lines.
- Scrollbars are thin and in the theme's colours.
- The open editor tab and its unsaved dot use the theme's accent colour; the middle mouse button closes a tab, and hovering one shows its path.
- Faster while a reply streams and while you edit: finished code blocks in a reply are no longer highlighted again on every word, and moving the editor's cursor no longer redraws the whole window.

## [0.1.0-rc.5] - 2026-11-09

### Added
- Rename, move and delete in the workspace file tree: a right-click menu (or `Shift+F10`), `F2` to rename in place, `Delete` to delete, and drag-and-drop onto a folder to move. Delete asks first and moves the item to the Recycle Bin or Trash. Open tabs follow renamed and moved files.
- **New file** and **New folder** buttons above the workspace file tree. Type a name or a path (missing folders are made too); the new item shows in the tree and a new file opens in a tab.
- The Workspace screen with no folder open offers **Continue in &lt;folder&gt;**, which reopens the folder you used last in one click.
- The code editor underlines syntax errors with a red squiggly line, shows the message on hover, and counts the problems below the file (`F8` next, `Ctrl+Shift+M` list). JavaScript and TypeScript are checked by TypeScript's own parser, loaded in the background only while you edit those files; Rust, JSON, YAML and XML by the grammar the editor already has.

### Fixed
- On Windows, installing or updating now tells Explorer to refresh its icons, so the taskbar shows the app's own icon instead of the Tauri icon it cached from an earlier version.
- The editor's own bars (the search bar, and now the problem count) no longer draw on top of dialogs and menus.

## [0.1.0-rc.4] - 2026-11-01

### Added
- A.I.D.P has its own icon (a star in a purple-to-gold hexagon), in place of Tauri's default: on the window, the taskbar or dock, and the Windows, macOS and Linux installers. The icon also replaces the "A.I.D.P" text at the left of the top bar.

### Fixed
- The "Unsaved changes" question before quitting or leaving a folder is now a real dialog: screen readers announce it with its message, focus starts on Cancel, Tab stays inside it, Escape cancels, and focus returns where it was afterwards.

## [0.1.0-rc.3] - 2026-11-01

### Added
- Themes: Glass, Soft, Cyber and Elegant join System, Dark and Light in Settings, each shown with its colours. Dark and Light gain an indigo accent on Send, the screen shown in the nav and your own messages. Code blocks in replies now follow a light theme too (decision 0020).
- Attachments in Chat and the workspace side chat: images, text or code files and PDFs, up to 5 per message, from the paperclip, a drop on the window, or a paste. Images go to models that can read them; text and a PDF's text are added to the message. Local models that Ollama reports can't see refuse images before anything is sent (decision 0019).

## [0.1.0-rc.2] - 2026-10-31

### Added
- Lucide icons for top navigation (Chat, Workspace, Models, Settings), workspace toolbar actions (Files, AI, Terminal, Refresh, Close folder), and the conversation list.
- Hideable and resizable chat list: toggle via the top bar button or `Ctrl+B`, and resize by dragging the splitter between the list and chat column.
- Pin and archive chats (SQLite migration 5): pin active chats to the top of the sidebar, archive older chats into a collapsible group, and automatically unarchive when a new message is sent.

### Fixed
- Streaming a reply no longer renders every earlier message again on each chunk. In a 20-message chat each chunk took about a tenth of the time and made about a fifth of the short-lived memory, which had pushed the app over its 200 MB workspace budget after a long local-model reply.
- Long chats keep only the messages near the view on the page (the message list is virtualized), so a chat's memory no longer grows with every reply: a 200-message chat went from about 50,000 page elements to about 1,600.
- Code files in the workspace editor and in proposed-change diffs are coloured by their language. Each language's grammar loads on first use, and the editor used to open before it arrived, so every file showed as plain text.

## [0.1.0-rc.1] - 2026-10-31

### Added
- Installers for Windows (NSIS `.exe`), macOS (universal `.dmg`) and Linux (`.AppImage`, `.deb`), built by a Release workflow started by hand (decisions 0016 and 0017). They aren't code-signed yet; the user guide shows how to open them.
- Signed updates: the app checks GitHub Releases 10 seconds after start (can be turned off in Settings) or on **Check for updates**, shows a bar when a new version exists, and installs it only on **Install and restart**, never with unsaved files. Settings shows the app version.
- Workspace layout: the file tree and the AI panel can be shown or hidden (**Files** and **AI** buttons, `Ctrl+B` and `Ctrl+Alt+B`) and resized by dragging the line beside them. The AI panel reopens when a command waits for approval.
- The window opens at 1024×640 (minimum 720×480), and the workspace panels shrink to fit a smaller window instead of overflowing.
- Local model runtime powered by Ollama: status detection, in-app start, model pull with live progress and cancel, deletion with confirmation, and memory unloading ("Free memory").
- `ollama_chat` provider adapter supporting streaming replies, tool calling, per-model `num_ctx`, and `keep_alive` options.
- Model picker grouping: cloud models grouped by provider and local models grouped under `Local · Ollama`, with disabled state and clear status when Ollama is stopped.
- Text budgeting for small context windows: caps attached file context chips and agent `read_file` limits to match the model's context window.
- Persistent chat history (SQLite migration 4): conversations and messages persisted locally in `aidp.db`; separate conversation history per workspace folder; Chat sidebar with filterable search and chat deletion.
- Settings screen: configurable default model, interface theme (Dark, Light, System), and Ollama keep-alive duration.
- Light and System theme support: dynamic Tailwind v4 neutral palette inversion, CodeMirror 6 theme compartment reconfiguration, and xterm terminal palette switching.
- Autonomous agent tools in workspace AI panel: `list_files`, `read_file`, `search`, `edit_file`, `create_file`, and `run_command` with boundary confinement and secret file shielding.
- User approval gate for model edits and commands: interactive diff review for file modifications and creation, and approval cards showing exact commands and working directory before execution; no auto-approve bypass.
- Built-in terminal panel running native shell (`powershell.exe -NoLogo` on Windows, `$SHELL` on Unix; decision 0011) via `@xterm/xterm`, `@xterm/addon-fit`, and `portable-pty`, toggled via top bar or `Ctrl+\`.
- Extended secret file shielding: automatically excludes package manager credentials, SSH/TLS keys, certificates, keystores, and detected private key blocks across all tools (decision 0010).
- Tool calling support in `openai_compat` and `anthropic` model provider adapters, preserving Claude thinking blocks in multi-turn tool loops.
- SQLite migration 3 adding `supports_tools` capability flag to `models` table.
- Workspace screen: open folders, virtualized file tree respecting `.gitignore` via `ignore` and `@tanstack/react-virtual`, recent folders history stored in SQLite `settings` table.
- CodeMirror 6 editor tabs: syntax highlighting via `@codemirror/language-data` with one-dark theme, dirty edit tracking, line ending and BOM preservation, conflict bar for files changed or deleted on disk.
- Workspace AI panel: multi-turn chat on `"workspace"` surface with context chips for open files and line selections, secret file auto-exclusion, and custom system contract.
- Interactive code diffs: `@codemirror/merge` unified diff review with Accept and Reject actions; non-git warning banner and confirmation dialog before first AI modification.
- Unsaved changes close guard: native window close interception via `CloseGuard` and Tauri Channel, preventing accidental loss of unsaved edits on folder switch or window close.
- First-run "Add a model" flow: configure provider presets (OpenAI, OpenRouter, Groq, DeepSeek, Gemini, Anthropic) or custom endpoints directly in the app.
- Models management page: test connections, view masked keys, replace keys, pick active models, and delete connections.
- Secure key storage in native operating system keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) via `keyring` v4 and `secrecy` with zero plain-text storage on disk.
- Anthropic adapter supporting Claude models streaming with token usage reporting.
- Grouped model picker in Chat interface with automatic default model selection.
- GitHub-flavoured Markdown (GFM) tables, strikethrough, and task lists in chat replies (`remark-gfm`).
- Security architecture specification (`docs/security.md`) and Decision Record 0007 (`docs/decisions/0007-connections-storage.md`).
- Streaming chat with one OpenAI-compatible provider, with Stop, Markdown, and code blocks you can copy.
- Initial project scaffolding with Tauri 2, React 19, TypeScript, and Vite.
- Typed IPC integration with `tauri-specta`, exporting TypeScript bindings via `cargo test`.
- Frontend unit testing setup using Vitest scoped to `src/**/*.test.{ts,tsx}`.
- Tailwind CSS v4 styling with `@tailwindcss/vite`.
- Clippy lints denying `unwrap_used` and `expect_used` outside tests.
- Common-Controls v6 linker directive in `src-tauri/build.rs` for Windows compatibility.
- Project documentation suite: Setup Guide (`docs/setup.md`), Phase Plan (`docs/phases/M0.md`), and Architecture Decision Records (`0001-use-tauri.md`, `0002-bindings-exported-by-test.md`).
- Moved master design document to `docs/design.md`.
- Dual license: MIT OR Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`, decision 0004).

### Changed
- On macOS and Linux, an app opened from Finder or a desktop menu takes `PATH` from your login shell, so model commands, the terminal and Ollama find the same programs as your own terminal. The macOS terminal starts a login shell.
- App display name is now **A.I.D.P** (window title, page title, heading). Internal names stay `aidp`.
- Replies show headings, lists, quotes and inline code with proper spacing.

### Removed
- The `config.local.json` key file, loader, and configuration panel (replaced by in-app Models management and OS keychain).

### Fixed
- Stop and the command timeout on Windows now also end a process the command started and left running after its shell exited (job object).
- A reply still streaming when you switch workspace folders is saved, as stopped, to the conversation it started in.
- The Agent label in the workspace AI panel is no longer cut off by a long model name.
- Workspace shortcuts work only on the Workspace screen; `Ctrl+\` no longer opens a terminal while another screen is showing.
- `config.local.json` still loads when an editor saves it with a byte-order mark.

### Security
- A model command containing a full-width character (such as `＂`) is refused, and on Windows so is any character the system's ANSI code page doesn't hold exactly, since some programs would receive it as a different ASCII character ("WorstFit").
- Updates are verified against the app's public key before they install; the release workflow pins every action to a commit hash because it holds the signing key.
- Agent tools cannot use the `.git` folder, also through links or names Windows trims such as `.git.` (decision 0012).
- PGP and PuTTY private keys and `*.ppk` files are treated as secret, like PEM keys (decision 0012).
- A model command containing hidden or control characters is refused before its approval card appears, so the card always shows what runs.
- Strict Content Security Policy (`default-src 'self' ipc: http://ipc.localhost`) in production with development-only CSP for Vite HMR.
- Removed unused Tauri plugins (opener plugin disabled).
