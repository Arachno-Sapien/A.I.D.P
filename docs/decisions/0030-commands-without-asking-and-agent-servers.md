# 0030 · Commands without asking, and servers the agent starts

Date: 2026-11-11 · Status: accepted (the human chose each part)

## Context

After decision 0029 the browser ran without a card per click, but every model command still waited for Run, and the agent could not start a dev server at all: everything a command starts is killed when it ends (the job object, workspace rule 4), so it had to ask the user to start the server in the terminal. The human asked for the browser to be visible "like Antigravity" and for an option to automate commands, servers included. Workspace rule 4 said "There is no auto-approve in v1".

## Options

Commands:
1. A per-task switch, "Run commands without asking", off by default, confirmed when turned on.
2. "Always allow" on the Run card: remember that exact command for this folder.
3. Both. 4. Keep asking.

Servers:
1. A tool that runs the server in a terminal tab the user sees and can stop.
2. A hidden background process stopped when the task ends.
3. Keep asking the user to start it.

Browser: a real window (drop `--headless`), screenshots on cards, or both.

## Choice

The human chose commands option 3, servers option 1, and browser "both", with the window now and screenshots later as their own task.

- **Run commands without asking** sits beside Review at end. Turning it on asks first; it is sent with `run_agent` (`options.runCommands`) and turns itself off when the task ends.
- **Always allow** stores `(folder, command)` in `allowed_commands` (migration 9). It matches the exact command after trimming its ends, so `npm test` does not allow `npm test && del /q *`. Settings lists them with Remove. It is checked per call, and not at all while Review at end is on: the agent may then have changed what the command runs (a `package.json` script) without the user seeing a diff (found by a security review of the first version).
- Either way the command still shows on a card with its folder, has its timeout, and Stop ends it.
- `start_server` asks like `run_command`, then keeps the process running (its own job object, no timeout) in a read-only terminal tab with the last 64 KB of output. `server_output` and `stop_server` need no answer. Servers end when the user stops them, the folder changes, or the app quits.
- The Browser checks preset drops `--headless` (decision 0027 updated).

## Why

The user asked for it and can see every command. The risk is that a file or page the agent reads steers it into a harmful command, which then runs as the user inside the folder. That is why the switch lasts one task and asks first, remembered commands are exact and per folder and can be removed, and servers stay visible and end with the folder.
