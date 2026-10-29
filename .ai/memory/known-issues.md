# Known issues

Bugs, gotchas, and approaches that failed. Newest first. If you hit one of the "not yet seen" items, move it up with the date and what actually happened.

## Seen in this repo

- **2026-10-29 · Windows MSVC `cargo test` and ComCtl32 v6 (STATUS_ENTRYPOINT_NOT_FOUND 0xc0000139).** When `aidp_lib` unit test binary is built by `cargo test --lib`, it doesn't get the Windows Application Manifest embedded by default. Because Tauri/Wry/Muda pulls in `TaskDialogIndirect` from `comctl32.dll`, Windows loads ComCtl32 v5.82 without a manifest and fails process initialization with `0xc0000139`. Fix: pass `/MANIFESTDEPENDENCY` for Common-Controls v6 via `cargo:rustc-link-arg` in `src-tauri/build.rs`, only when `CARGO_CFG_TARGET_ENV` is `msvc`. Unguarded, it breaks macOS/Linux builds, because their linkers read the flag as a file name.
- **2026-10-29 · Windows long paths.** `git clone` of some repos fails with "Filename too long" (seen with vercel-labs/agent-skills). The skills CLI still installed fine. Fix if needed: `git config --global core.longpaths true` (ask the human; it's a machine-wide setting).
- **2026-10-29 · Ollama "installed" ≠ "running".** `ollama --version` prints "could not connect to a running Ollama instance" when the server is off. Detection: try `GET 127.0.0.1:11434/api/version` first; only if that fails, look for the binary and offer Start.
- **2026-10-29 · Claude Code on the dev machine** has hooks (ECC GateGuard) that ask for a short fact statement before the first Bash/Write. That's the human's local setup, not a project bug: answer it and retry the same call.

## From docs, not yet seen here (check when you get there)

- **keyring 3.x has no default platform features.** Without them it silently uses an in-memory mock store and keys disappear on restart. Enable `windows-native` (plus `apple-native` / a Linux Secret Service feature when those ports start). Check that a saved key shows up in Windows Credential Manager.
- **rusqlite:** enable the `bundled` feature so Windows builds don't need a system SQLite.
- **Streaming parsers:** network chunks don't line up with lines. Buffer bytes and split on newlines before parsing. OpenAI-compatible APIs send SSE `data:` lines ending with `data: [DONE]`; Anthropic sends SSE with named `event:` lines; Ollama `/api/chat` streams NDJSON (one JSON object per line).
- **tauri-specta and specta** versions must match. If they're still pre-release on crates.io, pin exact versions (`=x.y.z-rc.n`) for both.
- **Ollama on Windows** usually runs as a tray app that starts the server itself. Spawn `ollama serve` only when `/api/version` fails and the binary exists.
