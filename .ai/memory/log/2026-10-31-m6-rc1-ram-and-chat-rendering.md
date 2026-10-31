# 2026-10-31 · M6 · rc.1 RAM and chat rendering
Agent: Claude Code (Opus 5.5)
Task: M6 Task 8 RAM on the installed rc.1; the human asked to look into a reading over budget, then to virtualize the message list
RAM (installed rc.1, Ollama excluded): idle 127 MB; workspace 189 MB; with terminal 192 MB; after a local-model reply 223–225 MB (197–199 without the user's shell). Ollama apart: server 89 MB, runner 3,177 MB
Root cause: each streamed chunk rendered every message again (Markdown parse, code highlighting); the list also kept every reply on the page
Changed: src/features/chat/MessageList.tsx (memoized MessageItem, then react-virtual with measured rows and scrollToIndex to the end), src/features/workspace/AiPanel.tsx (useCallback), src/lib/virtual.ts (zero-size fallback, shared with FileTree.tsx), tests, CHANGELOG, measure-ram.md, known-issues
Evidence (browser pane, Chromium, Vite dev, 100 chunks): 20 messages 234 ms/chunk +170 MB -> 22 ms +37 MB (memo); 100 messages 37 ms +40 MB -> 12 ms +16 MB (virtualized); a 200-message page 50,744 -> 1,571 elements
Problems: hidden pane runs no rAF, throttles setTimeout and fires no scroll events (flushSync and manual scroll events); jsdom reports 0 heights (measureElement falls back to the estimate) and clamps scroll to 0 (the test stubs scrollHeight and clientHeight)
Tests: 4 new (memo, AiPanel chunk, rows near the view, follows the end), each failed first; 208 Vitest, 220 Rust
Next: 0.1.0-rc.2, the update test, RAM again after a local-model reply, the Linux/8 GB VM
