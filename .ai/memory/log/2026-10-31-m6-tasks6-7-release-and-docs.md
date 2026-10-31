# 2026-10-31 · M6 · Tasks 6 and 7, release workflow and docs
Agent: Claude Code (Opus 5.5)
Task: M6 Task 6 (Release workflow, 0.1.0-rc.1) and Task 7 (docs)
Changed (6): .github/workflows/release.yml, src-tauri/tauri.updater.conf.json, tauri.conf.json (bundle metadata, macOS ad-hoc signing), version 0.1.0-rc.1 in package.json, package-lock.json, Cargo.toml, tauri.conf.json; docs/dev/release.md; AGENTS.md release-build row
Changed (7): docs/decisions/0017-release-and-updates.md, user guide (Install, Updates, troubleshooting), README (Status, Download, Building from source), CHANGELOG 0.1.0-rc.1, setup.md (macOS/Linux), security.md, design risk row, known-issues
Decisions: one draft job passes `releaseId` to the build matrix (lookup by tag skips drafts); all actions pinned to commit hashes after an automated security review (the job holds the signing key)
Release run: 41188603905 started by the human, passed first time; draft v0.1.0-rc.1 (id 429837322) has NSIS exe, universal dmg + app.tar.gz, AppImage, deb; latest.json lists all four platforms; every .sig names key EE9A69E11D7D346C. Not published
Tests: gate green (220 Rust, 204 Vitest); CI green on 919a1b4 on all three OSes
Next: Task 8, the human publishes rc.1 and runs the checks on real machines
