# 2026-11-09 · M6 · TypeScript's parser for JS/TS errors
Agent: Claude Code (Opus 5.5)
Task: the human's "Yes, add it": TypeScript's own parser as a checker for JS/TS files, after the cost was stated
Changed: src/features/workspace/diagnostics/ (new: typescript.ts `typescriptChecker`, `IDLE_MS`; typescriptWorker.ts; typescriptSyntax.ts `createTypeScriptSyntax(ts)`; typescript.test.ts, 7 tests); index.ts (`CHECKERS = [typescriptChecker, syntaxChecker]`, `check(state, filename)`); syntax.ts comment; diagnostics.test.ts (JS/TS route to TypeScript); package.json (`typescript` dev → runtime, same ~6.0.3); docs: decision 0023 (new), 0022 status, design.md, user-guide, CHANGELOG, AGENTS.md stack row
Design: language service with one file, `noLib`, `noResolve`, `getSyntacticDiagnostics` (public API; adds JS-only checks like type annotations in .js). In a module Web Worker, started on the first check, terminated after 5 idle minutes; on worker error, off until restart; no Worker → no problems
Measured: main bundle +0.7 kB; worker file 3.54 MB (brotli 0.74 MB); built worker in Chromium: first answer 257 ms, then 7 ms; Node: heap +21 MB, RSS +71 MB after loading
Checked in Chromium: dev page through the real worker (broken .ts 2 problems, modern .tsx none, `a: string` in .js flagged; messages with source "TypeScript"); `vite preview` loaded the built worker file and answered
Tests: 294 Vitest (8 new), 248 Rust, clippy and typecheck clean
Not yet: seen in the Tauri app; the worker's RAM in the installed app (next release's RAM check)
Next: the human tries it in the app
