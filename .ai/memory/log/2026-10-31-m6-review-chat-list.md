# 2026-10-31 · M6 · review of chat list, pin/archive and icons
Agent: Claude Code (Opus 5.5)
Task: the human asked to review Antigravity's four commits (38a9192, 7365acf, beaeecd, 1917731), fix bugs, then push; the human checked the icons ("they look fine")
Gate before review: clippy clean, 223 Rust, bindings unchanged, typecheck clean, 228 Vitest
Rust (migration 5, set_pinned/set_archived, archive unpins, a new message unarchives, NotFound for a missing id): no findings
Fixed, each test-first (5 new tests failed first):
- store.ts: setPinned/setArchived changed the list and switched chats even when the command returned an error
- ConversationList.tsx: rows were role="button" with Pin/Archive/Delete inside (hidden from screen readers); the opening part is now its own button with aria-current; Archived toggle has aria-expanded
- ChatScreen/ConversationList: the list was shrink-0 at its dragged width, so a narrower window squeezed the chat; now flex 0 1 width, min 180, chat min 360 (as the workspace panels)
- ModelPicker.tsx: with no models it now showed the AI panel's bar (Agent switch only); back to hidden unless a left control is given
Also: the new tests' `as any` optional calls made direct; LIST_WIDTH/LIST_MIN moved to ConversationList.tsx; GATES.md untracked and ignored (machine paths); user guide "New chat"; design.md shrink note; known-issues (nested buttons, GATES.md)
Tests: 233 Vitest, 223 Rust; clippy and typecheck clean; bindings unchanged
Not checked in the app: pin, archive, hide/resize, code colouring
Next: push, CI on three OSes, the human releases rc.2
