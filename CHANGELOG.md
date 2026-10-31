# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
