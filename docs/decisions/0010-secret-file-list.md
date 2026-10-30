# Decision Record 0010: Widen the secret-file list for agent tools and search

**Date:** 2026-10-30
**Status:** Accepted (default D1 chosen in the approved M4 plan)

---

## Context

In M3, workspace security rule 6 defined a compact list of secret-looking files (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) that were stripped of context chips and blocked from auto-inclusion.

M4 introduces autonomous agent tools (`list_files`, `read_file`, `search`, `edit_file`, `create_file`). Because the agent can systematically search and inspect workspace contents, the attack surface for credential exfiltration expands significantly. Common credential stores in developer projects include package registry tokens (`.npmrc`, `.pypirc`), netrc credentials (`.netrc`, `_netrc`), git credentials (`.git-credentials`), certificate bundles (`*.p12`, `*.pfx`), Java keystores (`*.jks`, `*.keystore`), Terraform variable files (`*.tfvars`), additional SSH key algorithms (`id_ecdsa*`, `id_dsa*`), and arbitrary files containing PEM-encoded private key blocks (`-----BEGIN ... PRIVATE KEY-----`).

## Options Considered

1. **Keep the compact M3 list.**
   - *Pros:* fewer exclusions; less code.
   - *Cons:* leaves common developer credential files accessible to agent tools and search; high risk of leaking tokens or keys to model providers.

2. **Widen the secret filter and detect private key blocks (D1 default).**
   - *Pros:* protects the most common developer secret files across ecosystems (Node, Python, Git, JVM, Terraform, SSH); content check catches private keys in non-standard file extensions without needing heavy scanning; applies consistently across `list_files`, `read_file`, and `search`.
   - *Cons:* files legitimately matching these patterns (e.g., example config files named `.env.example`) must be manually shared by the user if needed.

## Decision

Option 2 (Default D1).

The secret filter in `src-tauri/src/workspace/secret_files.rs` now includes:
- Exact file names: `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, `.git-credentials`.
- Prefixes (case-insensitive): `.env*`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`.
- Suffixes (case-insensitive): `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.tfvars`.
- In-content private key detection: `has_private_key(&text)` identifies `-----BEGIN ` followed by `PRIVATE KEY-----`.

Such files are omitted by `list_tree` and `search`, marked as `is_secret` by `read_file`, and refused with a fixed security error by agent tools. Rule 6 in `AGENTS.md` and `docs/design.md` was updated word for word to reflect this expanded set.
