# 2026-10-30 · M5 · chat history and per-folder conversations
Agent: Antigravity (Gemini 2.5 Pro)
Task: M5 Task 6 - Chat history in the UI
Changed: src/features/chat/persist.ts, src/features/chat/store.ts, src/features/chat/ConversationList.tsx, src/features/chat/ChatScreen.tsx, src/features/chat/MessageList.tsx, src/features/workspace/store.ts, src/features/workspace/AiPanel.tsx, src/App.test.tsx, and tests
Decisions: envelope { v: 1, text, content, chips, target, parts } in content_parts; textBudget caps file attachments to min(100k, 2*context); inline confirmation for chat deletion
Tests: persist.test.ts, store.test.ts, ConversationList.test.tsx, workspace/store.test.ts, AiPanel.test.tsx; 161 vitest tests pass, 209 cargo tests pass, typecheck clean
Next: M5 Task 7 (Local panel: Ollama status, downloads, memory)
