# 2026-11-09 · M6 · error underlines in the editor
Agent: Claude Code (Opus 5.5)
Task: the human's "Build it while ensuring modularity incase later on we need to upgrade/update the code error checker" (option: the editor's own parser, not an AI model)
Changed: src/features/workspace/diagnostics/ (new: index.ts `Checker`, `CHECKERS`, `checkerFor`, `diagnostics`, count line; syntax.ts `syntaxChecker`; diagnostics.test.ts, 12 tests); cm.ts (`diagnostics(filename)` in `createState`, not in diffs); package.json (`@codemirror/lint` ^6.9.7, already installed through `codemirror`); docs: decision 0022, design.md (Coding workspace, Later), user-guide, CHANGELOG, AGENTS.md stack row
Measured: real valid code parsed with each grammar (corpus: this repo, cargo registry, node_modules, Python 3.12 stdlib); numbers in decision 0022. Checked: Rust, JSON (not files with comments), YAML, XML. Not: JS/TS (9 of 29 modern constructs misread), Python, CSS, HTML, C/C++
Problems: (1) the count kept "1 problem" after deleting the bad text: lint drops a deleted range by mapping, with no new result; the count line now reads `diagnosticCount` on every update and always shows on checked files ("No problems"). (2) under the full parallel run `ensureSyntaxTree` hit its 200 ms budget; a cut-off tree can end in false errors and lint never re-ran, so a check now returns nothing until the tree is complete and `refresh` re-checks when the tree changes
Checked in Chromium (Vite page, removed): underline under `2`, hover "Unexpected "2"" / "Syntax", red count line in dark and light, none on a .ts file
Tests: 286 Vitest (12 new), 248 Rust, clippy and typecheck clean
Not yet: seen in the Tauri app
Next: the human tries it; first upgrade would be TypeScript's parser as a checker for JS/TS (bundle and RAM cost: the human decides)
