# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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

### Security
- Strict Content Security Policy (`default-src 'self' ipc: http://ipc.localhost`) in production with development-only CSP for Vite HMR.
- Removed unused Tauri plugins (opener plugin disabled).
