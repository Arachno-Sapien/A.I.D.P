# 2026-11-01 · M6 · themes Task 3, dropdown fix, version rc.3
Agent: Claude Code (Opus 5.5)
Task: docs/superpowers/plans/2026-11-01-m6-themes.md Task 3, after the human's check ("Checked, all good") and the dropdown report ("The dropdown menus are little buggy")
Root cause (dropdowns): an open select list is drawn over white, so Glass's see-through greys composited to ~#41414b and Chromium's checked row was grey on light grey; fix 2f5e029: --color-popup (solid) per theme, option:checked uses the accent; test requires a solid popup with readable text; known-issues entry. The human: "Dropdowns look right"
Review (web-design-guidelines, guidelines fetched fresh): fixed Composer textarea name (aria-label "Message"), theme buttons in role=group aria-label Theme, "..." to "…" in two placeholders (ChatScreen.test updated); listed, not fixed: App.tsx:177 and :220 dialogs lack role=dialog, aria-modal and focus handling (older code); AttachmentChip, MessageList, themes.css pass
Version: 0.1.0-rc.3 in package.json, package-lock.json, Cargo.toml, tauri.conf.json; CHANGELOG [0.1.0-rc.3] holds attachments and themes
Tests: 3 new (popup colour and contrast, message box name, theme group), red first; 264 Vitest, 247 Rust (versions_match_across_files passes), clippy and typecheck clean
Changed from the plan: RAM with Glass measured on the installed rc.3 (same procedure as rc.2) rather than a local release build
Next: push; the human releases rc.3; update rc.2 → rc.3; RAM with Dark and Glass
