# Progress

Updated: 2026-10-29 by Claude Code (Opus 5.5)

## Current milestone: M0 Setup

- [ ] `npm run tauri dev` opens an empty window on Windows
- [ ] CI runs clippy, tests, and typecheck on every push
- [ ] AGENTS.md holds the stack, folder, security, documentation, and memory rules; docs/ and .ai/memory/ exist with templates. *AGENTS.md and .ai/memory/ done; docs/ not yet*
- [ ] Rust book chapters 1 to 9 read (human)

## Dev machine (checked 2026-10-29)

| Tool | Status |
| --- | --- |
| Node | v22.22.2 ✓ |
| npm | 12.0.1 ✓ |
| git | 2.51.2 ✓ (project folder is **not** a git repo yet) |
| gh | 2.98.0 ✓ |
| Rust (rustup, cargo) | rustup 1.29.1, rustc 1.99.1, cargo 1.99.1 (stable-msvc) ✓ |
| VS Build Tools, C++ workload | VS Build Tools 2022 & 2026, VC.Tools.x86.x64 ✓ |
| Ollama | installed, server not running |

## Done

- AGENTS.md (shared rules), CLAUDE.md and GEMINI.md (pointers), .ai/memory/
- 8 agent skills in `.agents/skills/` + `.claude/skills/`, recorded in `skills-lock.json` (AGENTS.md section 12)

## In progress

Task: M0 Setup — Git init, .gitignore, and scaffold Tauri 2 + React + TS + Vite
Agent: Antigravity (Gemini 3.8 Flash)
Date: 2026-10-29
Next step: git init, add .gitignore, commit docs and skills

## Next 3 tasks

1. `git init`, add `.gitignore` (`node_modules/`, `dist/`, `src-tauri/target/`, `config.local.json`, `.claude/settings.local.json`, `.kiro/`), first commit containing the docs and skills.
2. Scaffold Tauri 2 + React + TypeScript + Vite into the repo root with `npm create tauri-app@latest`, keeping the existing files. Add the `typecheck` script.
3. Verify `npm run tauri dev` opens an empty window and update docs.

## Rest of M0

- Add Tailwind, Zustand, tauri-specta (bindings exported to `src/lib/bindings.ts` on debug start)
- `.github/workflows/ci.yml` running the gate (AGENTS.md section 8) on `windows-latest`
- Move the design doc to `docs/design.md` and update the link at the top of AGENTS.md
- `docs/setup.md`, `docs/phases/M0.md`, `docs/decisions/0001-use-tauri.md`, `CHANGELOG.md`
