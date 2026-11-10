# 2026-11-10 · M6 · review agent edits at the end
Agent: Claude Code (Opus 5.5)
Task: The human's "Add Option B": a switch so the agent writes edits as it works and the user reviews them all at the end
Changed: src-tauri/src/tools/{agent,mod}.rs, src-tauri/src/commands/chat.rs, src-tauri/tests/agent.rs, src/features/workspace/{store,agent,AiPanel,DiffView,WorkspaceScreen,ReviewCard}.tsx/ts (+ review.test.ts, ReviewCard.test.tsx, AiPanel.test.tsx), src/features/chat/store.ts (+test), src/lib/bindings(.test).ts, AGENTS.md, docs/{design,security,user-guide}.md, README.md, CHANGELOG.md, docs/decisions/0028
Decisions: 0028. Rust decides: `run_agent(.., review_at_end, ..)`; edit_file/create_file skip the approval wait (not after Stop); run_command and MCP tools still ask. System prompt swaps `EDITS_ASKED` for `EDITS_AT_END`. Workspace rule 3 and the Never line amended.
UI: "Review at end" checkbox beside Agent (off by default, off again on folder change, asks once in a non-git folder). The store collects writes from step cards (`review`: path, text before the first write or null for new, text after the last). `ReviewCard` after the reply: Undo per file, Undo all, Keep all; a file name opens its diff in `DiffView` (Close button). Undo reads the file and writes the old text only if it still equals the agent's text (CRLF read as LF); new files go to the Recycle Bin via `remove`.
Problems: specta takes at most 10 command arguments; `run_agent` reached 11, so the attachment store and MCP hub now come from `AppHandle`. Python patch scripts in text mode wrote CRLF into 5 files on Windows; converted back. Backslash escapes again lost through the Bash tool (known-issues).
Tests: clippy clean; cargo test 303 passed (2 new agent tests); typecheck clean; vitest 49 files / 366 passed (9 store, 5 card, 3 panel tests new).
Not done: not seen in the app (`npm run tauri dev`); not pushed.
Next: the human tries it in the dev app on a multi-file task with Browser checks.
