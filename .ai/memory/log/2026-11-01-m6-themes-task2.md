# 2026-11-01 · M6 · themes Task 2 (effects, hooks, picker)
Agent: Claude Code (Opus 5.5)
Task: docs/superpowers/plans/2026-11-01-m6-themes.md Task 2 ("Start Task 2 here")
Changed: src/themes.css (new) imported in main.tsx; SettingsScreen.tsx (picker with swatches, aria-pressed); Markdown.tsx (oneLight on a light base); term.ts and TerminalPanel.tsx (cursor colour; Cyber's accent); hook classes in App, ChatScreen, ConversationList, Composer, MessageList, ModelPicker, WorkspaceScreen, ModelsScreen, SettingsScreen; themes.ts (Glass backdrop #3a1f6b/#0b4757); docs (design Settings, user guide, CHANGELOG [Unreleased])
Decisions: a fifth hook, app-shell (screen background, transparent in Glass) so panels are one see-through layer, not two stacked; text sits straight on Glass's backdrop, so the backdrop was darkened and the contrast test now checks secondary text on it (>= 4.98:1); accent via bg-accent utilities (Send, active nav, user bubbles at 15% with a 30% border) in every theme, as the refined-flat mock-up showed
Problems: jsdom drops hsl() colours, so the code-colour test checks the theme given to the highlighter (vi.fn wrap); a render left mounted broke the next test (no auto cleanup, known-issues); a Python heredoc turned \\n into real newlines (fixed with Edit)
Tests: 5 new (picker, hooks in App, terminal cursor, code colours, Glass backdrop contrast), red first (code colours checked red with the change taken out); 263 Vitest, 247 Rust; build has the accent utilities (color-mix over the variable) and the theme rules
Not yet: seen in the app; review; RAM with Glass
Next: themes Task 3
