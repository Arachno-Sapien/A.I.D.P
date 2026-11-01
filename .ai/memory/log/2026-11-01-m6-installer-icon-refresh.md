# 2026-11-01 · M6 · installer refreshes Explorer's icons
Agent: Claude Code (Opus 5.5)
Task: the human's "Yes, add it": the Windows installer tells Explorer to refresh icons after install or update, so rc.1–rc.3 users don't keep Tauri's taskbar icon
Changed: src-tauri/installer-hooks.nsh (new, `NSIS_HOOK_POSTINSTALL` with `SHChangeNotify(0x08000000, 0x1000, 0, 0)`, the call Tauri's unused `UPDATEFILEASSOC` makes); src-tauri/tauri.conf.json (`bundle.windows.nsis.installerHooks`); src-tauri/tests/release.rs (`windows_installer_refreshes_icons`, red then green); CHANGELOG [Unreleased]; docs/dev/release.md (App icon note); known-issues
Checked: local `npm run tauri build -- --bundles nsis` ran makensis with the hook; generated installer.nsi includes the file and inserts the macro at the end of the install section; the same call fixed the human's taskbar by hand
Problems: Tauri's NSIS download timed out twice (`timeout: global`) though curl worked; NSIS placed by hand in `%LOCALAPPDATA%\tauri\NSIS` (known-issues)
Tests: 248 Rust, 272 Vitest, clippy and typecheck clean
Not yet: a real install or update running the hook (next release)
Next: the next release carries it; check the taskbar after updating
