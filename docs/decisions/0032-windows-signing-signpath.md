# Decision Record 0032: Sign the Windows installer through SignPath Foundation

**Date:** 2026-11-12
**Status:** Accepted by the human ("Try SignPath (free)"); waiting for SignPath Foundation to accept the project. Replaces the Windows half of decision 0017 D2 once it does.

---

## Context

The Windows installer is unsigned (decision 0017, D2). Browsers and Windows SmartScreen warn on every download, and the human found it "really difficult to download the exe file from GitHub". An unsigned file earns reputation only per exact file, so each release starts from zero. A signed file builds reputation for its publisher across releases. No certificate skips that build-up any more: since 2024 EV certificates get no instant SmartScreen trust either.

## Options considered

1. **Stay unsigned.** Free, but every release warns from scratch.
2. **Microsoft Artifact Signing (Trusted Signing).** About $9.99 a month, signs from CI. Individuals can sign up only in the USA and Canada.
3. **An OV certificate from a certificate authority.** About $100 or more a year, and the key must sit on a hardware token or the CA's cloud signing service.
4. **SignPath Foundation (chosen).** Free for open-source projects. The certificate is issued to SignPath Foundation, which Windows shows as the publisher.

## Decision

- Apply to SignPath Foundation's open-source program. The human applies, owns the SignPath account, turns on two-factor login for SignPath and GitHub, and approves every signing request by hand. Agents never hold a signing credential.
- The README carries the code signing policy the program requires: their attribution, team roles, a privacy statement and uninstall steps. The release page links to it.
- Once the project is accepted, `release.yml` changes on the Windows job:
  - The app's `aidp.exe` is signed before NSIS packs it, then the installer is signed.
  - The updater's `.sig` (minisign, decision 0017 D3) is made **after** Authenticode signing. Signing changes the file's bytes, so a `.sig` made before would fail every update check.
  - SignPath requires the same product name (A.I.D.P) and the same version in each build's metadata; Tauri already sets both.

## Consequences

- Windows will name "SignPath Foundation" as the publisher, not the project.
- Each Windows release waits for the human's approval in SignPath during the Release workflow.
- Until SignPath accepts, nothing changes in the builds: the installer stays unsigned and the user guide's steps still apply.
- macOS signing (decision 0017 D2) is unchanged.
- One open point to confirm with SignPath: the project is licensed "MIT OR Apache-2.0". Their terms forbid commercial dual licensing, which a choice between two open licenses isn't.
