# Decision Record 0008: Native Folder Picker Architecture

**Date:** 2026-10-30
**Status:** Accepted

---

## Context

In Milestone 3 (Coding workspace), the application needs to allow users to select and open local folders on their computer. The folder picker must:
1. Work natively across Windows, macOS, and Linux.
2. Integrate cleanly with Tauri 2's window lifecycle and async runtime.
3. Adhere to the core security rule that the frontend cannot access arbitrary filesystem or dialog capabilities directly.
4. Avoid threading issues or COM initialization deadlocks on Windows.

---

## Options Considered

### 1. Direct `rfd` (Rust File Dialog) crate
- **Pros:** Minimal dependency overhead; calls platform dialog APIs directly from Rust.
- **Cons:** Spawning synchronous dialogs on the main thread can hang the WebView or fail to attach modal ownership to the parent window; requires manual background thread offloading and window handle coordination.

### 2. `tauri-plugin-dialog` v2 (official Tauri plugin)
- **Pros:**
  - Maintained by the Tauri team specifically for Tauri 2 apps.
  - Automatically handles modal parent window attachment and platform event loops.
  - Provides `blocking_pick_folder()` which runs cleanly inside `tokio::task::spawn_blocking` without freezing the UI window.
- **Cons:** Introduces a Tauri plugin dependency (`tauri-plugin-dialog@2.8.4`).
- **Security Control:** Even though it is a Tauri plugin, **zero permissions** are granted in `src-tauri/capabilities/default.json`. The JavaScript frontend has no permission to call the plugin directly; the folder dialog is invoked strictly through the app's thin Tauri command `open_folder` in Rust, which canonicalizes the chosen path and validates it before updating application state.

---

## Decision

Adopt `tauri-plugin-dialog` v2 (pinned to `~2.8.4`, avoiding 3.0 alphas). It is registered in `lib.rs` and called strictly inside `spawn_blocking` in `src-tauri/src/commands/workspace.rs`. No capabilities are exposed to the frontend.
