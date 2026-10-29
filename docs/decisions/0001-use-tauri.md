# Decision Record 0001: Use Tauri 2 for Application Shell

**Date:** 2026-10-29
**Status:** Accepted

---

## Context

The application aims to provide a unified desktop interface for chatting with both cloud models (OpenAI, Anthropic, OpenRouter, etc.) and local models (Ollama). The user's machine needs to run local models without heavy overhead from the wrapper application itself.

Key requirements:
1. Low idle memory: under 150 MB RAM at idle when no model is active.
2. Hardened security: API keys must remain strictly in the OS keychain and never be exposed to the web frontend or logged.
3. Cross-platform support starting with Windows, then macOS and Linux.

---

## Options Considered

1. **Electron:**
   - *Pros:* Widely used, mature ecosystem, large library of modules.
   - *Cons:* Bundles an entire Chromium runtime and Node.js instance. Idle memory footprint frequently exceeds 250–400 MB, directly competing with local LLM VRAM/RAM budgets. Bundled installer is 80–120 MB.
2. **Web-Only Application (Localhost Server):**
   - *Pros:* Lightweight, browser handles rendering.
   - *Cons:* Poor OS keychain integration; requires a persistent background daemon or localhost port management; vulnerable to browser extension probing and lacks native window controls.
3. **Tauri 2 (Rust Core + System WebView):**
   - *Pros:* Uses the OS built-in browser engine (WebView2 on Windows); tiny binary size (~4 MB); idle RAM < 50–100 MB; memory safety and performance of Rust for networking, Ollama process control, and OS keychain interactions.
   - *Cons:* Requires Rust compiler and platform build tools for developers.

---

## Decision

We chose **Tauri 2**.

1. **Memory efficiency:** By leveraging the OS WebView, idle RAM is well below our 150 MB ceiling, reserving memory for Ollama model inference.
2. **Security architecture:** A clear, enforceable boundary exists between the Rust backend and the React UI. The UI cannot access keys, disk, or network directly; all actions pass through thin, typed Tauri commands.
3. **Small distribution size:** Installer and updates are orders of magnitude smaller than equivalent Electron apps.
