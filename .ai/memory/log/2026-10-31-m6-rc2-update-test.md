# 2026-10-31 · M6 · rc.2 release and the update test
Agent: Claude Code (Opus 5.5)
Task: M6 Task 8, release 0.1.0-rc.2 and test the update from the installed rc.1
CI: push of 691cfb2, run 41217002508 green on three OSes (233 Vitest each; 223 Rust on Windows and macOS, 222 on Linux)
Release: run 41219130980 (started by the human) passed; draft held the NSIS exe, universal dmg and app.tar.gz, AppImage and deb with .sig files; latest.json 0.1.0-rc.2 for windows, darwin (aarch64, x86_64) and linux, every signature key EE9A69E11D7D346C
Published: by the human, 16:33 UTC, normal release; releases/latest is v0.1.0-rc.2 and serves its latest.json
Update test: the human reported rc.1 updated itself ("Published, updated"); installed aidp.exe product version 0.1.0-rc.2, installer ran 16:34 UTC (uninstall.exe time; NSIS keeps the build time on aidp.exe, known-issues)
Checklist: "Auto-update tested" ticked; the installers box waits for 0.1.0
Not yet seen in rc.2: pin, archive, chat list hide/resize, code colouring
Next: the human checks those in rc.2; RAM after a local-model reply; Linux/8 GB VM; review, 0.1.0
