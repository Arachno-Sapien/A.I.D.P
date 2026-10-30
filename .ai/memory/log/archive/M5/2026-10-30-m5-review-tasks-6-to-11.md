# 2026-10-30 · M5 · review and fixes for Tasks 6 to 11
Agent: Claude Code (Opus 5.5)
Task: Review Antigravity's M5 Tasks 6 to 11 against the plan; fix the findings (human: "Yes, fix here")
Review: gate green (211 Rust, 179 vitest); picker, Local panel, settings, theme and docs match the plan
Found (a vitest probe confirmed 1):
1. A reply streaming when the user opened another chat (sidebar, New chat, or leaving Chat, which remounts and reloaded the newest chat) was never saved, and opening a chat cleared `streaming`
2. Start failing was silent; Delete, Free memory and context errors were dropped
3. Cancelling a download showed "Stopped." as a download error
4. A restored provider error lost its message (only the kind was stored)
Changed (worktree ../aidp-m5fix2, branch m5-review2, merged):
- chat/ConversationList.tsx: New chat, switching and delete wait while a reply streams; workspace/AiPanel.tsx hides Clear during a reply
- chat/store.ts + ChatScreen.tsx: `opened` flag; Chat opens the newest chat only on its first visit
- chat/persist.ts: the envelope keeps the whole error
- models/store.ts + LocalPanel.tsx: `ollamaError` for Start, Get Ollama, Delete, Free memory and context; shown in every Ollama state; a cancelled pull is no error
Not changed: a stopped partial reply is still lost when the workspace folder switches mid-reply (the switch stops it first)
Tests: 8 new (vitest 187); gate green
Next: Task 12, the human live check
