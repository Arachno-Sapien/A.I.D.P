# 2026-11-11 · M6 · AI panel options wrap
Agent: Claude Code (Opus 5.5)
Task: The human's screenshots: in a narrow AI panel the Agent / Review at end / Run commands without asking labels covered "Model:", the no-git note wrapped one word per line, and the confirm dialog was clipped
Cause: (1) ModelPicker bar and the AiPanel option row never wrap, and every label is `shrink-0 whitespace-nowrap`. (2) ConfirmDialog is `fixed inset-0` but renders inside the ModelPicker bar, whose `backdrop-blur` (backdrop-filter) makes it the containing block for fixed descendants
Changed: `ModelPicker.tsx` bar `flex-wrap`; `AiPanel.tsx` option row `flex-wrap`, no-git alert `basis-full flex-wrap`, "Clear this chat?" nowrap; `ConfirmDialog.tsx` renders through `createPortal(…, document.body)` (fixes every caller)
Docs: CHANGELOG (Fixed)
Tests: typecheck, 382 Vitest pass; checked in the dev app (options on their own row under the model picker). Narrower widths and the dialog not clicked live: an agent run was in progress
Next: none
