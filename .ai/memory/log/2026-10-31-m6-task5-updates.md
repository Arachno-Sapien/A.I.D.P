# 2026-10-31 · M6 · Task 5, signed updates
Agent: Claude Code (Opus 5.5)
Task: M6 Task 5, check and install signed updates from GitHub Releases
Key: the human generated it; both GitHub secrets set; only `aidp.key.pub` was read (key ID EE9A69E11D7D346C), never the private key
Changed: src-tauri/Cargo.toml (tauri-plugin-updater 2.14, `default-features = false`, native-tls, system-proxy, zip), tauri.conf.json (`plugins.updater`), src/updates.rs, src/commands/updates.rs, connections.rs (`AppError::Update`, `check_updates_at_start`), close_guard.rs (`has_unsaved`), lib.rs, tests/release.rs; UI: settings/updates.ts, UpdateBar.tsx, SettingsScreen.tsx, store.ts, App.tsx, appErrorText.ts; docs: security.md section 11, user guide, design, AGENTS.md, CHANGELOG, plan
Decisions: no updater permission in the capability file (Rust drives the plugin); install refused with unsaved files; quiet check 10 s after start, off switch in Settings
Problems: the plugin's default `rustls-tls` switched on rustls (no crypto provider) inside our own reqwest; turned off. Plugin 2.14 also installs .deb and .rpm updates (the plan had assumed AppImage only)
Tests: 3 Rust (may_install, versions_match, versions across files) + settings round trip; 8 Vitest (bar, settings, start check on/off); 220 Rust, 204 Vitest. Dev app starts with the plugin; install untested until a release exists
Next: Task 6, the Release workflow
