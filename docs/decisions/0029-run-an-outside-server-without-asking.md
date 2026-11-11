# 0029 · Run an outside server without asking

Date: 2026-11-11 · Status: accepted (the human chose it)

## Context

Browser checks ask before every call. A short page test is 10 to 20 clicks, reads and snapshots, and each one stops the agent until the user presses Run. The human asked for an auto-approve mode after a live run with a card for every `browser_click`. Decision 0025 and the outside-tool rules said "no auto-approve".

## Options

1. Trust a server for one task: an "Allow for this task" button on the card. Fewer clicks, but still one per task.
2. A per-server setting, "Run without asking", off by default, kept until turned off.
3. Option 1 plus model commands. Rejected: a file the agent reads could make it run any command as the user.
4. Keep asking every time.

## Choice

Option 2, chosen by the human. Each server in Settings has a **Run without asking** switch, stored in `mcp_servers.auto_approve` (migration 8, default 0). Turning it on asks first; turning it off does not.

- When a run starts it reads the list; calls to a server with the switch on get a card with the exact arguments and no Run/Deny (`needs_answer: false`), then run. A change applies from the next task; Stop ends a run.
- Only for tools the server offered this run (the existing check). Model commands, edits and other servers are unchanged: commands always ask.
- Nothing else about a server changes: it still starts only when enabled, runs outside the folder, and gets nothing from the keychain.

## Why

The user adds every server by hand and can see every call on its card. The browser preset is headless, uses a throwaway profile and is limited to localhost addresses (still to be checked live, plan Task 8). The risk is that a page or tool result steers the agent into calls the user didn't want; the dialog says so, and the setting is per server, so a server the user doesn't trust keeps asking.
