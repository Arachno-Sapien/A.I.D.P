# Decision Record 0017: How v0.1 is packaged, signed and updated

**Date:** 2026-10-31
**Status:** Accepted (the human approved the defaults for D1 to D4 of the M6 plan on 2026-10-31)

---

## Context

v0.1 ships on Windows, macOS and Linux (decision 0016). The project has no code-signing certificates and no budget for them yet, only one maintainer with one Windows machine, and an app that can edit files and run commands, so its updates must not be a way in.

## Decisions

1. **Formats (D1).**
   - Windows: one NSIS `.exe` that installs per user, with no admin prompt. MSI is dropped: WiX rejects versions like `0.1.0-rc.1`, and one Windows format is enough.
   - macOS: one universal `.dmg` for Apple silicon and Intel.
   - Linux: `.AppImage` (any distribution) and `.deb` (Debian, Ubuntu).
   - Not built: MSI, `.rpm`, Flatpak, Snap, ARM builds.
2. **No paid signing for v0.1 (D2).**
   - Windows installers are unsigned. SmartScreen warns; the user clicks More info → Run anyway.
   - macOS builds are ad-hoc signed (`signingIdentity: "-"`), which Apple silicon needs to open them at all, but not notarized. Gatekeeper blocks the first open; the user clicks Open Anyway in System Settings.
   - Why: an Apple Developer account costs $99 a year, and a Windows certificate or Azure Trusted Signing costs money too, before the app has users. The design's risk table already chose "document how to proceed; sign once the app has users". The user guide shows both warnings.
3. **Updates (D3).**
   - `tauri-plugin-updater`, driven from Rust only. The window gets no updater permission.
   - One quiet check 10 seconds after start (off switch in Settings), and **Check for updates** on demand.
   - Nothing installs until the user clicks Install, and never while a file has unsaved changes.
   - Every update is signed with a key pair the human generated. The private key and its password live only in GitHub secrets and the human's backup; the public key is in `tauri.conf.json`, and the app refuses an update it doesn't verify.
4. **Releasing (D4).**
   - A workflow the human starts by hand builds every installer into one draft release; the human checks it and publishes it.
   - Release candidates (`0.1.0-rc.N`) are published as normal releases, because the updater reads `releases/latest`, which skips pre-releases.
   - The workflow holds the key, so every action in it is pinned to a commit hash.

## Options not taken

- Paying for signing now: fewer warnings, but a recurring cost before there are users.
- A release on every push or tag: less work, but no human check before files go public.
- Background or silent installs: convenient, but an app that runs commands should not change itself unasked.

## Consequences

- First-run warnings on Windows and macOS until the builds are signed; the user guide explains them.
- Losing the private key means installed copies can never be updated again; the human keeps a backup.
- macOS ships without a test on a real Mac; the release notes say so.
