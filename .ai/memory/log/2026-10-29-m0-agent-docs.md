# 2026-10-29 · M0 · agent docs and skills
Agent: Claude Code (Opus 5.5)
Task: Shared agent rules + dev skills so any AI tool can pick up the project mid-stream
Changed: AGENTS.md, CLAUDE.md, GEMINI.md, .ai/memory/progress.md, .ai/memory/known-issues.md, .agents/skills/, .claude/skills/, skills-lock.json
Decisions:
- One rules file (AGENTS.md). CLAUDE.md and GEMINI.md only import it, per the design doc.
- Skills installed with `npx skills add … -a claude-code codex antigravity --copy -y`. Copy, not symlink, because of Windows.
- Installed: tauri, rust-best-practices, vercel-react-best-practices, vitest, writing-plans, test-driven-development, systematic-debugging, verification-before-completion.
- Skipped superpowers `executing-plans`: its scripts call `subagent-driven-development`, which isn't installed.
- Design doc left at repo root; moving it to docs/design.md is an M0 task.
Problems: Rust not installed; folder not a git repo; vercel-labs clone hits Windows long-path limit.
Tests: no code yet. Reviewed every installed skill before install (no network calls or agent-directed text); tauri, rust, vitest copies byte-identical to reviewed sources; .claude/skills == .agents/skills.
Next: human installs Rust + VS Build Tools, then git init + Tauri scaffold (progress.md Next 3)
