# Decision Record 0012: The .git folder is off limits; PGP and PuTTY keys count as private keys

**Date:** 2026-10-30
**Status:** Accepted (the human approved the recommended set on 2026-10-30)

---

## Context

An automated security review of the M4 push found two gaps in rule 6:

- `.git` was hidden from `list_files` and `search` walks, but `read_file(".git/config")` worked without approval. A remote URL in that file can carry a token (`https://x-access-token:...@github.com/...`). Writing into `.git/hooks` or `.git/config` would also let a proposed file run code on the user's next git command.
- `has_private_key` matched `PRIVATE KEY-----`, which misses PGP keys (`-----BEGIN PGP PRIVATE KEY BLOCK-----`) and PuTTY keys (`PuTTY-User-Key-File-`, `*.ppk`).

## Options considered

1. **Keep rule 6 as it is.** No change; both gaps stay.
2. **Refuse `.git`, add PGP and PuTTY keys and `*.ppk` (chosen).** Small, no new dependency.
3. **Also match home-folder paths** (`.aws/credentials`, `.kube/config`, `.docker/config.json`) **and scan for token formats.** These files rarely sit inside a project, and token patterns need a regex dependency and flag ordinary code.

## Decision

Option 2.

- `workspace::paths` refuses any path with a `.git` component (case-insensitive) and any path whose canonical form lands in `.git` through a link, for `resolve` and `resolve_new`. The UI's workspace commands share the check; the file tree already hides `.git`.
- `tools::run::refused` tells the model "tools cannot use the .git folder" and to ask for a git command instead.
- `is_secret` adds `*.ppk`; `has_private_key` also matches `PRIVATE KEY BLOCK-----` headers and lines starting `PuTTY-User-Key-File-`.
- Rule 6 in `AGENTS.md` and `docs/design.md` is updated word for word.

Tests: `git_folder_is_refused` (`tests/workspace.rs`), `git_folder_is_off_limits` (`tests/tools.rs`), and new rows in `is_secret_table` and `has_private_key_table`.
