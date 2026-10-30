# Decision Record 0013: Ollama detection, external install link, and in-app start

**Date:** 2026-10-30
**Status:** Accepted (the human approved defaults D1 and D2 on 2026-10-30)

---

## Context

A.I.D.P supports local models powered by Ollama on the dev and user machines. The app needs to know whether Ollama is installed and running, help the user install it if missing, and start it if stopped.

Installing Ollama involves platform-specific installers (e.g. `OllamaSetup.exe` on Windows), admin privileges, background services, and GPU driver detection that Ollama's official installer handles best.

## Options considered

1. **Bundle or download the Ollama installer and run it inside the app.** Complicates the app with installer downloads, checksum verification, execution of external setup binaries, and platform-specific UAC elevations.
2. **Link to the official download page when missing, and start the local binary if stopped (chosen).** Clear separation of concerns: Ollama owns its install/update lifecycle; A.I.D.P detects it and manages runtime interaction.

## Decision

Option 2 (defaults D1 and D2).

- **Detection:** Checks `GET http://127.0.0.1:11434/api/version`. If it responds 200, state is `Running` (version extracted). If connection fails, the app checks whether the `ollama` binary exists on disk:
  - Windows: `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, `%PROGRAMFILES%\Ollama\ollama.exe`, `%PROGRAMFILES(X86)%\Ollama\ollama.exe`, or on `PATH`.
  - Non-Windows: `/usr/local/bin/ollama`, `/usr/bin/ollama`, or on `PATH`.
  - Security: When scanning `PATH`, relative entries (`.` or relative subdirectories) are strictly ignored to prevent binary hijacking.
- **Not Installed:** When no binary is found, state is `NotInstalled`. The Local panel displays "Get Ollama", opening `https://ollama.com/download` in the default browser using the `open` crate.
- **Stopped:** When the binary is found but the server is off, state is `Stopped`. The user can click "Start", which spawns `ollama serve` in the background with `CREATE_NO_WINDOW` on Windows and polls `/api/version` every 500 ms for up to 15 seconds.
- **Single Connection:** A single connection row (`kind: "ollama"`, label `Ollama (local)`) is managed in SQLite and cannot be deleted from the cloud connections list.
