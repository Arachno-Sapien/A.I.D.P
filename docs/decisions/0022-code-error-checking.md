# Decision Record 0022: Error Underlines in the Code Editor

**Date:** 2026-11-09
**Status:** Accepted (the human chose the editor's parser, built so the checker can be upgraded). JavaScript and TypeScript are now checked by TypeScript's own parser: decision 0023.

---

## Context

The human asked for squiggly underlines under mistakes in the workspace editor, the way VS Code shows them, and whether a chosen AI model should check the code all the time.

## Options considered

1. **An AI model checking on every pause.** Costs tokens or keeps a local model loaded (the dev laptop has 4 GB of VRAM), takes seconds, sends code out all day, and its answers vary with no exact positions. Rejected; AI fits better as an on-demand "fix this" later.
2. **The editor's own parser.** CodeMirror already parses every file to colour it, and its grammars mark parse errors. No download, no process, no extra memory. Syntax only.
3. **TypeScript's own parser** for the JS/TS family. Exact, every modern construct, but the `typescript` package is about 9 MB of script and tens of MB of RAM while a JS/TS file is open.
4. **Language servers** (rust-analyzer, tsserver, pyright), as VS Code does. Real type errors, but hundreds of MB to GBs of RAM, one server per language for the user to install, and some run project code when a folder opens (`build.rs`), so they need a "trust this folder" step.

## Decision

Option 2 now, behind a small interface so options 3 and 4 can be added later without touching the editor.

`src/features/workspace/diagnostics/`: a `Checker` has a name, `appliesTo(filename)`, `check(state)` (may be async) and an optional `refresh(update)`. `CHECKERS` is in order of preference; a file gets the first checker that reads it, and only that one. `cm.ts` calls only `diagnostics(filename)`, which adds the underlines (`@codemirror/lint`, already installed through `codemirror`), the hover message with the checker's name, and a count line below checked files (F8 next, Ctrl+Shift+M list). At most 100 problems are shown.

## Which languages, measured

Each grammar parsed real, valid code; any error it reported is a false one.

| Language | Valid files | With false errors | Checked |
| --- | --- | --- | --- |
| Rust | 813 | 3 (bare `$` in `macro_rules!` arms, `Token![mut]` as a type argument) | Yes |
| JSON | 320 | 0 (files that allow comments, like `tsconfig.json`, are skipped by name) | Yes |
| YAML | 25 | 0 | Yes |
| XML | 8 | 0 (mismatched and unclosed tags are reported too) | Yes |
| TypeScript | 445 | 41; 9 of 29 modern constructs misread (`export { type X }`, `p is T`, `declare module`, labeled tuples) | No |
| JavaScript | 714 | 6; import attributes, `export default class extends`, `0XA` | No |
| Python 3.12 stdlib | 234 | 10 (bare `yield`, `1.`, class patterns in `case`) | No |
| HTML | 83 | 22 (template tags such as Django's) | No |
| CSS | 2 | 1 (Tailwind's `@apply`) | No |
| C, C++ | 13 | 4 (macros, inline assembly) | No |

A check reports nothing until the file is parsed to its end, because a tree cut off part way can end in errors that aren't in the code; `refresh` checks again once the background parse moves on.

## Consequences

- No new download, no new process, no new permission. Memory is unchanged.
- JS/TS, Python, CSS, HTML and C/C++ get no underlines yet. The first upgrade is option 3 for JS/TS (a new checker listed above `syntaxChecker`); option 4 needs its own milestone, its own decision and a trust prompt.
- To add a language to the parser checker, measure its grammar on real files first and add it to `CHECKED` in `syntax.ts` only if it reports no false errors.
