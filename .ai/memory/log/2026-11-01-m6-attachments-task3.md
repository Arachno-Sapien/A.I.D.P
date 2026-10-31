# 2026-11-01 · M6 · attachments Task 3 (the UI)
Agent: Claude Code (Opus 5.5)
Task: docs/superpowers/plans/2026-11-01-m6-attachments.md Task 3 ("Start Task 3 here")
Changed: src/features/chat/store.ts (MessageAttachment, pending, attachNotice, add/remove/pick/paste, send with attachments and the vision check), persist.ts (attachments in the envelope), Composer.tsx (store prop, paperclip, chips, paste, status, vision block), AttachmentChip.tsx (new; thumbnail from read_attachment), MessageList.tsx (chips on sent messages), ChatScreen.tsx and AiPanel.tsx (pass their store), App.tsx (watchDrops to the chat on screen), tauri.conf.json (CSP img-src 'self' data:), docs (security §6 and §12, design Chat and Workspace, user guide, CHANGELOG [Unreleased])
Decisions: thumbnails as data: URLs from base64 (plan said blob:), so img-src 'self' data:; react-markdown already drops data: sources in replies (test pins it); Composer takes the chat store so Chat and the side chat each keep their own attachments; a message may be only attachments (title from the first file)
Tests: 20 new (8 store, 1 persist, 5 Composer, 3 AttachmentChip, 1 MessageList, 1 App drop routing, 1 Markdown data: guard). Store, persist, MessageList and App tests failed first; the Composer tests were checked red against the old Composer; the Markdown guard pins existing behaviour. 253 Vitest, 246 Rust, clippy and typecheck clean
Not yet: tried in the app by the human
Next: the human's check in the dev app; then the themes plan
