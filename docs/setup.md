# Setup Guide

This guide walks through taking a fresh Windows machine to a fully running instance of **aidp**.

---

## 1. Prerequisites (Windows)

Ensure the following tools are installed:

| Tool | Required Version | Verification Command | Notes |
| --- | --- | --- | --- |
| **Node.js** | ≥ 22.x | `node -v` | Installed with npm (`npm -v`) |
| **Rust** | Stable (MSVC) | `rustc -V && cargo -V` | Installed via `rustup default stable-x86_64-pc-windows-msvc` |
| **C++ Build Tools** | VS 2022 or 2026 Build Tools | `vswhere.exe -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` | Visual Studio Build Tools with "Desktop development with C++" workload |
| **WebView2** | Evergreen Runtime | Preinstalled on Windows 11 | Required for Tauri 2 system WebView |
| **Git** | ≥ 2.x | `git --version` | Recommended: `git config --global core.longpaths true` (see Known Issues) |
| **Ollama** | Optional (for local models) | `ollama --version` | Server runs at `http://127.0.0.1:11434` |

> [!NOTE]
> If `git clone` or installing agent skills fails with "Filename too long" errors on Windows, enable long path support:
> ```powershell
> git config --global core.longpaths true
> ```

---

## 2. Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repo-url> aidp
   cd aidp
   ```

2. **Install frontend dependencies:**
   ```bash
   npm ci
   ```

3. **Restore agent skills (if working with AI agents):**
   ```bash
   npx skills experimental_install
   ```

4. **Run the desktop app in development mode:**
   ```bash
   npm run tauri dev
   ```
   This will start Vite on port `1420` and launch the native Tauri window.

---

## 3. The Four-Part Project Gate

Before every commit, all four checks must pass cleanly without warnings:

1. **Rust Clippy (Linter):**
   ```bash
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   ```
2. **Rust Tests & Bindings Verification:**
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
   *(This also runs the `export_bindings` test to generate `src/lib/bindings.ts`)*
3. **TypeScript Typecheck:**
   ```bash
   npm run typecheck
   ```
4. **Frontend Unit Tests:**
   ```bash
   npx vitest run
   ```

---

## 4. Production Release Build

To build the standalone release executable without generating installer bundles:
```bash
npm run tauri build -- --no-bundle
```
The output binary will be created at:
```text
src-tauri/target/release/aidp.exe
```
