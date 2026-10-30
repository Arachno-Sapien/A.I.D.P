# 2026-10-30 · M5 · local models in the picker
Agent: Antigravity (Gemini 2.5 Pro)
Task: M5 Task 8 - Picker, start-up and empty states
Changed: src/features/models/store.ts, src/features/chat/ModelPicker.tsx, src/features/chat/ChatScreen.tsx, src/features/chat/errorText.ts, src/App.tsx, and tests
Decisions: parseModelKey splits on first colon; local models grouped under 'Local · Ollama' and disabled when stopped; ChatScreen prompts local download when Ollama is running and no models exist; app startup refreshes Ollama
Tests: store.test.ts, ModelPicker.test.tsx, ChatScreen.test.tsx, errorText.test.ts, App.test.tsx; 173 vitest tests pass, 209 cargo tests pass, clippy and typecheck clean
Next: M5 Task 9 (Settings: default model, theme, keep_alive)
