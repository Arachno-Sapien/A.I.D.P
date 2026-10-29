# 2026-10-29 · M0 · review of Antigravity's M0 work, fixes, rename
Agent: Claude Code (Opus 5.5)
Task: Review M0 (commits f351fbe..1a48645), fix findings, rename display name, human window check
Changed: src-tauri/build.rs, .github/workflows/ci.yml, src-tauri/Cargo.toml, src-tauri/tauri.conf.json, src-tauri/src/main.rs, index.html, src/App.tsx, public/tauri.svg (deleted), docs/phases/M0.md, docs/setup.md, docs/decisions/0003-app-name.md, AGENTS.md (section 14), CHANGELOG.md, .ai/memory/
Decisions:
- build.rs manifest flag only when CARGO_CFG_TARGET_ENV == msvc (unguarded, it breaks macOS/Linux links).
- Display name A.I.D.P; internal names stay aidp / aidp_lib / com.aidp.desktop (decision 0003).
- Kept Antigravity's specta rc.26 / specta-typescript 0.0.13: tauri 2.12.5 depends on specta rc.26, so there's one version in the tree.
- Size-focused release profile (panic = "abort", lto) kept and documented in M0.md.
Problems:
- The previous session ticked "window opens" without a window check. It's now confirmed by the human (dev + release, Greet works, no CSP errors).
- The previous session reported a clean tree, but 7 files each had a stray trailing blank line. Discarded.
Tests: gate green twice (clippy, cargo test, typecheck, vitest); bindings.ts unchanged. Release build 1m41s, aidp.exe 4.3 MB; the Rust process is ~29 MB, excluding WebView2 children.
Next: human gives the GitHub repo name and visibility for the CI push; human reads Rust book ch 1-9; then plan M1.
