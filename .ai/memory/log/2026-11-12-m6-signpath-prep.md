# 2026-11-12 · M6 · Windows signing through SignPath Foundation (prep)
Agent: Claude Code (Opus 5.5)
Task: the human's "How can we remove the "Harmful file" warning", then "Try SignPath (free)"
Research: SmartScreen reputation is per file when unsigned and per publisher when signed; EV no longer skips it (Microsoft docs). Azure Artifact Signing: individuals only in the USA and Canada. SignPath Foundation terms: OSI license without commercial dual licensing, own source only, verifiable CI builds, manual approval per release, two-factor login, a "Code signing policy" on the home and release pages with their attribution, team roles and a privacy statement, uninstall instructions
Changed: README.md ("Code signing policy" section, link from Download), .github/workflows/release.yml (draft body links the policy), docs/user-guide.md (Uninstall), docs/decisions/0032 (new), 0017 status, docs/dev/release.md
Decisions: 0032. Not built yet: the signing step itself; it needs SignPath's project IDs and can't be tested before acceptance
Gotcha recorded in 0032: the updater's minisign `.sig` must be made after Authenticode signing, or every update fails verification
Open: confirm with SignPath that "MIT OR Apache-2.0" is fine; the human's two-factor login status
Tests: docs and a workflow string only
Next: the human applies; then the release.yml Windows job (sign exe, bundle, sign installer, then `.sig`)
