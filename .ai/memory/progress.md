# Progress

Updated: 2026-10-29 by Antigravity (Gemini 3.8 Flash)

## Current milestone: M0 Setup

- [x] `npm run tauri dev` opens an empty window on Windows (and `npm run tauri build -- --no-bundle` produces release binary)
- [ ] CI runs clippy, tests, and typecheck on every push (workflow defined in `.github/workflows/ci.yml`; awaiting remote repo confirmation from human)
- [x] AGENTS.md holds the stack, folder, security, documentation, and memory rules; docs/ and .ai/memory/ exist with templates.
- [ ] Rust book chapters 1 to 9 read (human)

## Dev machine (checked 2026-10-29)

| Tool | Status |
| --- | --- |
| Node | v22.22.2 ✓ |
| npm | 12.0.1 ✓ |
| git | 2.51.2 ✓ (repo initialized on master) |
| gh | 2.98.0 ✓ |
| Rust (rustup, cargo) | rustup 1.29.1, rustc 1.99.1, cargo 1.99.1 (stable-msvc) ✓ |
| VS Build Tools, C++ workload | VS Build Tools 2022 & 2026, VC.Tools.x86.x64 ✓ |
| Ollama | installed, server not running |

## Done

- AGENTS.md (shared rules), CLAUDE.md and GEMINI.md (pointers), .ai/memory/
- 8 agent skills in `.agents/skills/` + `.claude/skills/`, recorded in `skills-lock.json` (AGENTS.md section 12)
- Repo hygiene: `.gitattributes` (LF), `.gitignore` (ignoring `.serena/`), M0 plan reviewed and approved
- Scaffolded Tauri 2 + React 19 + TypeScript + Vite (`aidp`, `com.aidp.desktop`)
- Typed IPC with `tauri-specta` exporting `src/lib/bindings.ts` via unit test
- Hardened security: strict production CSP, opener plugin removed, clippy denying unwrap/expect
- Added Windows Common-Controls v6 linker directive in `src-tauri/build.rs` to fix `STATUS_ENTRYPOINT_NOT_FOUND`
- Frontend testing with Vitest (`src/lib/bindings.test.ts`), full 4-part gate passing
- Tailwind CSS v4 styling with `@tailwindcss/vite`
- Verified release build (`src-tauri/target/release/aidp.exe`)
- Documentation: `docs/design.md` (moved), `docs/setup.md`, `docs/phases/M0.md`, `docs/decisions/0001-use-tauri.md`, `docs/decisions/0002-bindings-exported-by-test.md`, `CHANGELOG.md`
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running the 4-part gate and checking for `bindings.ts` drift

## In progress

None. To claim: task / tool + model / date started / next step.

## Next 3 tasks

1. Human input: confirm GitHub repository name and visibility (public/private) to add remote and push CI workflow.
2. Human: complete reading Rust book chapters 1 to 9 to close Milestone M0.
3. Milestone M1: Start cloud model chat plan with OpenAI-compatible adapter.
