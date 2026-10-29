# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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
- App display name is now **A.I.D.P** (window title, page title, heading). Internal names stay `aidp`.
- Replies show headings, lists, quotes and inline code with proper spacing.

### Removed
- The `config.local.json` key file, loader, and configuration panel (replaced by in-app Models management and OS keychain).

### Fixed
- `config.local.json` still loads when an editor saves it with a byte-order mark.

### Security
- Strict Content Security Policy (`default-src 'self' ipc: http://ipc.localhost`) in production with development-only CSP for Vite HMR.
- Removed unused Tauri plugins (opener plugin disabled).
