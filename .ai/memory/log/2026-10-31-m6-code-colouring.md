# 2026-10-31 · M6 · code colouring for rc.2
Agent: Claude Code (Opus 5.5)
Task: the human asked when code files get coloured, then "Yes, fix it for rc.2"
Root cause: `@codemirror/language-data` loads grammars lazily; `createState` read `matchFilename(...).support` before any `load()`, so it was always undefined (since M3). The unused language compartment was added twice
Changed: src/features/workspace/cm.ts (`loadLanguage`, `languageFor`, `mountDiff` filename), store.ts (`editorState` async, awaited in openFile, reload, acceptProposal), DiffView.tsx (loads, then mounts; no mount after close), tests, CHANGELOG, known-issues, progress
Tests: 5 new (cm: language once loaded, diff language; store: opened .py is python; DiffView: mounts with the path, no mount after close). The first three failed first; the close test was checked by removing its guard. 213 Vitest, 220 Rust
Not checked: colours in the running app (rc.2 or the dev app)
Next: push; the human runs the Release workflow for rc.2
