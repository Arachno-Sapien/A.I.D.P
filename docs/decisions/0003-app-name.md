# Decision Record 0003: App Name

**Date:** 2026-10-29
**Status:** Accepted

---

## Context

The design doc left the app name open. The M0 scaffold needed one, so it used the provisional name `aidp`.

## Options Considered

1. Keep the lowercase `aidp`.
2. A pronounceable word name (for example "Switchyard").
3. The acronym **A.I.D.P**.

## Decision

The display name is **A.I.D.P**, chosen by the human. The expansion stays open ("AI Independent Development Platform" for now) and may change as features land.

Internal names stay `aidp`:

- npm package `aidp`: npm names can't contain capitals.
- Cargo crate `aidp` / `aidp_lib`: Cargo names can't contain dots.
- Identifier `com.aidp.desktop`: it names the app-data folder (SQLite, WebView data), so changing it later would strand user data. Keep it unless the human decides otherwise before M2.

## Consequences

- Renaming the display name later touches four places: `productName` and the window `title` in `src-tauri/tauri.conf.json`, `<title>` in `index.html`, and the heading in `src/App.tsx`.
- Repository: https://github.com/Arachno-Sapien/A.I.D.P (settled 2026-10-29).
