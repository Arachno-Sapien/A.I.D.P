# 2026-11-21 · M6 · attachment index (message_hex)
Agent: Claude Code (Opus 5.5)
Task: the human's "Fix it" after a Graphify trace showed attachments_in_use read every message while holding the one DB lock (start-up clean-up, chat delete, and every discard of an unsent attachment), while ~25 sync commands that run on the UI thread wait on that lock.
Changed: src-tauri/src/db/mod.rs (migration 11 message_hex + backfill hook), src-tauri/src/db/conversations.rs (hex_runs, index_message, index_all_messages, insert_message in one transaction, attachments_in_use reads the index only); docs/design.md, CHANGELOG.md, known-issues.md.
Decisions: kept the old "anywhere in the text" rule exactly: whole 64-char runs are indexed lookups, longer runs are stored whole and searched window by window, so an ID inside tool output still counts and no file in use is removed.
Tests: db::tests attachment_check_reads_the_index (red before: scan found nothing once text was blanked) and the_index_migration_backfills_old_messages (shown to fail with the backfill switched off); existing history tests unchanged. Gate green: clippy clean, rust 393, typecheck, vitest 423.
Also this session: built a Graphify graph (graphify-out/, untracked; excludes .agents, .claude and icons in graphify-out/.graphify_build.json).
Next: the human decides on commit and on ignoring graphify-out/.
