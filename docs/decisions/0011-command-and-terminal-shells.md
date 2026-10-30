# Decision Record 0011: Shells for model commands and the terminal panel

**Date:** 2026-10-30
**Status:** Accepted (default D3 chosen in the approved M4 plan)

---

## Context

Milestone 4 introduces two process execution surfaces in the coding workspace:
1. **Model commands:** The AI model asks to execute shell commands (e.g. `npm test`, `git status`, `cargo build`) via the `run_command` tool, which require user approval before execution.
2. **Terminal panel:** The user opens an interactive terminal in the opened folder.

On Windows, developers commonly use both `cmd.exe` and PowerShell (`powershell.exe`). We need to choose which shell to invoke for model-requested commands, and which shell to spawn for the user terminal.

## Options Considered

### Model commands (`run_command`)
1. **`cmd.exe /D /S /C "<command>"` on Windows, `sh -c` on Unix (Option 1 - Accepted).**
   - *Pros:* Near-instant process startup time (sub-millisecond overhead); `cmd.exe` executes commands exactly as written without PowerShell script execution policy errors (`ExecutionPolicy Restricted`); AI models generate standard `cmd` syntax reliably.
   - *Cons:* Legacy Windows syntax for complex compounding (`&&`, `&`, `|`), though sufficient for standard developer commands.
2. **`powershell.exe -Command "<command>"` on Windows.**
   - *Pros:* Modern Windows scripting environment.
   - *Cons:* Slower process startup overhead per command (~300-500ms on Windows); risk of execution policy blockers (`File ... cannot be loaded because running scripts is disabled on this system`); models often mix syntax and run into quoting issues.

### Interactive Terminal Panel
1. **Windows PowerShell (`powershell.exe -NoLogo`) on Windows, `$SHELL` on Unix (Option 1 - Accepted).**
   - *Pros:* Standard modern interactive terminal environment expected by developers on Windows 10/11; supports aliases, autocompletion, Git prompts, and modern CLI tools; Unix respects the user's configured `$SHELL` with fallback to `/bin/sh`.
   - *Cons:* None.
2. **`cmd.exe` on Windows.**
   - *Pros:* Familiar classic command prompt.
   - *Cons:* Poor interactive developer experience compared to PowerShell in modern workflows.

## Decision

We adopt default D3:
- **Model commands (`run_command`):** Execute via `cmd.exe /D /S /C "<command>"` on Windows and `sh -c "<command>"` on Unix. The tool specification explicitly instructs the model on which shell is being used (`cmd.exe on Windows, sh on Unix`). Standard input is disabled (`Stdio::null()`), and commands execute in the workspace root directory with a 120-second timeout.
- **Terminal panel:** Spawns `powershell.exe -NoLogo` on Windows and `$SHELL` (falling back to `/bin/sh`) on Unix, with `TERM=xterm-256color`. The session runs in the workspace root directory and terminates cleanly when the folder is closed or changed.
