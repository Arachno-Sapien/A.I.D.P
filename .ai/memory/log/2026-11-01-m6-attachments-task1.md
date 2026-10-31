# 2026-11-01 · M6 · attachments Task 1 (store in Rust)
Agent: Claude Code (Opus 5.5)
Task: docs/superpowers/plans/2026-11-01-m6-attachments.md Task 1, after the human approved both plans ("Approve, start here")
Changed: src-tauri/src/attachments/{mod,pdf}.rs (new), commands/attachments.rs (new), commands/history.rs (clean-up on delete), db/conversations.rs + history.rs (attachments_in_use), lib.rs (store, DropWatch, DragDrop), main.rs (--pdf-text child), Cargo.toml, bindings, docs/decisions/0019, docs/security.md §12, AGENTS.md (stack row, structure line)
Decisions: PDF parsing in a child process (pdf-extract and lopdf have dozens of panic paths and release is panic = "abort"); child writes text to a file (pdf-extract has a println!); bytes over IPC as base64 (Vec<u8> is a JSON number array); pick and drop return { added, refused }
Deps: pdf-extract 0.12 (+26 crates incl. lopdf 0.42, nom, ttf-parser, aes, md-5, weezl), sha2 0.10 and base64 0.22 (already in the tree); dev lopdf 0.42
Tests: 15 new (14 unit incl. real PDF extraction and a 300 ms child kill, 1 history), each red first (compile); 238 Rust, 233 Vitest, clippy and typecheck clean
Checked by hand: built debug aidp.exe --pdf-text: real PDF exit 0 in 0.7 s with its text; broken PDF exit 1, no output file
Not yet: the UI (Task 3), sending to models (Task 2)
Next: Task 2, ChatMessage.attachments and each adapter's image block, migration 6 supports_vision
