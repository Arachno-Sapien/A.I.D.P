# 2026-11-12 · M6 · Top bar, drop-downs, message box
Agent: Claude Code (Opus 5.5)
Task: The human asked: Chat + Workspace centred in the top bar, Models + Settings top right; rounded drop-downs with a thinner border and scrollbar; text, Attach and Send centred in the message box (Chat and Workspace)
Changed: `App.tsx` header is a `grid-cols-[1fr_auto_1fr]` with two `<nav>`s (aria-labels "Screens", "Setup"); `App.css` `@supports (appearance: base-select)` styles `::picker(select)` (radius, 1px border, thin scrollbar, popup colour), options and optgroups, hides `::checkmark`; `Composer.tsx` textarea `py-1.5 min-h-8` so one line is 32 px like Attach and Send
Decisions: the open list of a native `<select>` is drawn by the OS; only customizable select (`appearance: base-select`, Chromium 135+) can style it. WebView2 (Chromium 157) has it; WKWebView and WebKitGTK don't, so macOS and Linux keep the system list (the `@supports` guard)
Docs: CHANGELOG (Unreleased, Changed)
Tests: typecheck, 385 Vitest pass; checked in the dev app: centred tabs, model list rounded with thin scrollbar, Chat message box aligned. Workspace message box is the same component, not opened with a folder
Next: none
