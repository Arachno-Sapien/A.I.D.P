# Decision Record 0023: TypeScript's Parser for JavaScript and TypeScript Errors

**Date:** 2026-11-09
**Status:** Accepted (the human: "Yes, add it", after the size and memory cost was stated)

---

## Context

Decision 0022 added error underlines from the editor's own grammars, but left JavaScript and TypeScript out: their grammar flags valid modern code (9 of 29 constructs tested, 41 of 445 real TypeScript files). Those are the languages this project, and most projects opened in A.I.D.P, are written in.

## Options considered

1. **Filter the grammar's known gaps.** Each gap is a pattern to recognise, errors cascade past it, and new syntax keeps arriving. Rejected.
2. **TypeScript's own parser** (`typescript`, already a dev dependency for `tsc`). It reads every construct the grammar misread, gives TypeScript's own messages (`',' expected.`), and in `.js` files also reports TypeScript-only syntax. Cost: a 3.5 MB worker file (0.74 MB brotli-compressed in the app) and its memory while loaded.
3. **Wait for language servers.** Type errors too, but much more memory, a server to install, and a trust step. Kept for later.

## Decision

Option 2, as a second checker behind the interface from decision 0022:

- `diagnostics/typescript.ts` (`typescriptChecker`) reads `.js .mjs .cjs .jsx .ts .mts .cts .tsx` and `.d.ts`, and comes first in `CHECKERS`.
- The parser runs in a Web Worker (`typescriptWorker.ts`), so loading it and parsing never stall typing. The worker starts on the first JS/TS check and is let go after 5 minutes without one. A worker that fails to load stays off until the app restarts; files then show no problems.
- `typescriptSyntax.ts` takes `ts` as an argument, so the compiler is never in the main bundle. It uses a language service that knows only the one file (`noLib`, `noResolve`), so it reports syntax only; given the folder's files and TypeScript's lib files, the same service could report type errors (`getSemanticDiagnostics`).
- `Checker.check` now also receives the filename, because the extension tells TypeScript the kind of file.
- `typescript` moved from `devDependencies` to `dependencies` (same `~6.0.3`).

## Measured

- Build: main bundle 1,080.5 kB → 1,081.2 kB; new `typescriptWorker-*.js` 3.54 MB (gzip 0.98 MB, brotli 0.74 MB), loaded only when a JS/TS file is checked.
- Speed: the built worker's first answer in Chromium took 257 ms (loading the compiler), later ones 7 ms; a 16 KB file takes about 9 ms in Node.
- Memory in Node after loading and checking: heap +21 MB, process +71 MB. Not yet measured in the installed app: that is part of the next release's RAM check (`docs/dev/measure-ram.md`), with a JS/TS file open.

## Consequences

- JS/TS files get underlines with no false errors on the constructs that failed before; Rust, JSON, YAML and XML keep the grammar checker.
- While a JS/TS file is being edited, the workspace holds the worker's memory on top of its budget; five idle minutes give it back.
- The next step for type errors is to feed this worker the folder's files (read through Rust, inside the folder rules) or a language server, as its own decision.
