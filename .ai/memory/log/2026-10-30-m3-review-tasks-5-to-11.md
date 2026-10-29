# 2026-10-30 · M3 · review of Tasks 5 to 11, and fixes
Agent: Claude Code (Opus 5.5)
Task: Review Gemini's M3 Tasks 5 to 11; fix what the review found before the live check
Checked: gate (clippy, 103 Rust + 1 ignored, 108 vitest, typecheck, bindings unchanged); dependencies exactly as planned; capabilities and tauri.conf unchanged; no fetch/invoke/raw HTML in the UI; chat surfaces, close guard, chat store, applyProposal, context.ts, DiffView match the plan
Blocker found: typed edits never reached `buffers` (the view's state was never written back). A throwaway probe showed view "zero one", buffer "one", dirty false, Save wrote "one". So: no dirty marker, Save wrote the original text, tab switches dropped edits, unsaved prompts never fired, the AI panel sent stale text and no selection
Other fixes: save refuses to write without a buffer (it wrote ""); tab and buffer keyed by the requested path (they differed for links); Save all stops quitting or switching folders when a save fails; folder switch clears buffers; edits typed during a save stay dirty; setUnsaved only when dirty flips; selection kept in the store and sendable without the file chip (too-large files); EditorPane picks up reloaded or accepted buffers and remounts after the last tab closes; close guard never blocks without a listening window; security.md error name and CSP text corrected, CSP look moved to the Task 12 live check
Changed: src/features/workspace/{buffers,cm,store,EditorPane,AiPanel}.ts(x), src/App.tsx, src-tauri/src/close_guard.rs, tests (editorSync.test.ts new; store, EditorPane, AiPanel, App, cm tests), docs/security.md, the plan's Task 12 step 4, known-issues.md, progress.md
Tests: 14 frontend + 1 Rust added or changed, each seen failing first; 121 vitest pass
Next: Task 12 with the human
