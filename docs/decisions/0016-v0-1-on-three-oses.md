# Decision Record 0016: v0.1 ships on Windows, macOS and Linux

**Date:** 2026-10-30
**Status:** Accepted (answered by the human)

---

## Context

The design left one release question open (AGENTS.md section 14): does v0.1 ship for Windows only, or for all three operating systems? Windows is the development machine and the only one tested so far. The app is open source (decision 0004), and the human wants anyone, on any OS, to be able to use it.

## Options considered

1. **Windows only for v0.1;** macOS and Linux later. Smaller release, everything tested on real hardware.
2. **Windows, macOS and Linux in v0.1.** Every user can install it from the first release; more to build and check.

## Decision

Option 2. The human's answer: "I plan to make it open source so any os user can acess this application."

## What it changes

- M6's checklist asks for CI-built installers for all three on GitHub Releases, not only Windows. AGENTS.md, the design doc and the README say so.
- The M6 plan settles the details with the human. Open points it will raise:
  - which macOS builds (Apple silicon, Intel, or both) and whether to sign and notarize them. Unsigned apps show Gatekeeper warnings, and signing needs a paid Apple Developer account;
  - which Linux formats (AppImage, .deb), and the Secret Service the keychain needs (AGENTS.md section 6 says to show a clear error without one, never a plain-text fallback);
  - how macOS and Linux get tested without those machines (CI runs, a VM, or volunteers), and what the release notes say about it.
- Windows stays the platform that is tested first and most.
