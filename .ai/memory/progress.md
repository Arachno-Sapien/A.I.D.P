# Progress

Updated: 2026-10-29 by Antigravity (Gemini 3.8 Flash)

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
| git | 2.51.2 ✓ (repo initialized on master) |
| gh | 2.98.0 ✓ |
| Rust (rustup, cargo) | rustup 1.29.1, rustc 1.99.1, cargo 1.99.1 (stable-msvc) ✓ |
| VS Build Tools, C++ workload | VS Build Tools 2022 & 2026, VC.Tools.x86.x64 ✓ |
| Ollama | installed, server not running |

## Done

- AGENTS.md (shared rules), CLAUDE.md and GEMINI.md (pointers), .ai/memory/
- 8 agent skills in `.agents/skills/` + `.claude/skills/`, recorded in `skills-lock.json` (AGENTS.md section 12)
- Repo hygiene: `.gitattributes` (LF), `.gitignore` (ignoring `.serena/`), M0 plan reviewed and approved

## In progress

Plan: `docs/superpowers/plans/2026-10-29-m0-setup.md`
Current task: Task 3 (Tailwind CSS and window check)
Provisional app name: `aidp`, identifier: `com.aidp.desktop`
Agent: Antigravity (Gemini 3.8 Flash)
Date: 2026-10-29
Next step: Task 3: Install Tailwind CSS v4 and @tailwindcss/vite, restyle App.tsx, test dev and release windows

## Next 3 tasks

1. Task 1: Scaffold Tauri 2 + React + TS outside repo, copy in, remove opener, set strict CSP & clippy lints.
2. Task 2: Configure typed IPC via tauri-specta, add Vitest with bindings test, verify gate and commit Tasks 1 & 2.
3. Task 3: Configure Tailwind CSS v4, verify dev window and release build.

## Rest of M0

- Add Tailwind, Zustand, tauri-specta (bindings exported to `src/lib/bindings.ts` on debug start)
- `.github/workflows/ci.yml` running the gate (AGENTS.md section 8) on `windows-latest`
- Move the design doc to `docs/design.md` and update the link at the top of AGENTS.md
- `docs/setup.md`, `docs/phases/M0.md`, `docs/decisions/0001-use-tauri.md`, `CHANGELOG.md`
