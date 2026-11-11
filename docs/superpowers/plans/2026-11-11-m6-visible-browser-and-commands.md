# Visible browser, commands without asking, servers in a terminal tab: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The agent's browser opens as a window the user watches, the user can let model commands run without the Run card (per task, or per remembered command), and the agent can start a dev server that keeps running in a terminal tab the user sees.

**Architecture:** The Browser checks preset drops `--headless`. Two approval shortcuts in the agent loop's `run_command` branch reuse the "no receiver means yes" path of `edit_answer`: a per-task flag sent with `run_agent`, and a per-folder list of exact commands in SQLite. A new `tools/servers.rs` keeps long-running processes (piped, in a job object, no timeout) with a 64 KB output tail; three tools start, read and stop them; the terminal panel gets a tab per server that replays and streams its output read-only.

**Tech Stack:** Rust (tokio, rusqlite, windows-sys job objects already in `command.rs`), tauri-specta, React + Zustand, xterm (already used by the terminal).

**Spec:** the human's choices on 2026-11-11 (this conversation): visible window now, screenshots on cards later; per-task switch **and** remembered commands; servers in a visible terminal tab. Rules: `AGENTS.md` §6 (workspace rule 4 changes, decision 0030), `docs/design.md` "Workspace and tool security".

## Global Constraints

- No new dependency, Tauri plugin or capability permission.
- No `unwrap()`/`expect()` outside tests; `bindings.ts` only regenerated (`cargo test` → `export_bindings`).
- `run_agent` already has 10 specta arguments (the limit, known-issues 2026-11-10): new flags go in one struct argument.
- Both shortcuts are off by default; turning on the per-task switch asks first. Every command still shows on a card with its exact text and folder.
- Edits, outside servers and the Review at end flow are unchanged.
- Gate before every commit: clippy `-D warnings`, `cargo test`, `npm run typecheck`, `npx vitest run`. Commits `M6: ...` ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A server outlives its folder or the app (folder switch, app quit) → it must be killed. Test: dropping `Servers` ends the process (Task 4).
2. A server crashes after printing its URL → `server_output` says it exited with its code, the tab shows "exited" (Task 4, Task 5).
3. A chatty server prints megabytes → only the last 64 KB is kept and replayed (Task 4).
4. A remembered `npm test` must not allow `npm test && del /q *` or `npm  test` with different spacing inside; only leading/trailing whitespace is ignored (Task 3).
5. "Run commands without asking" left on → it turns off when the task ends, and a new folder starts with it off (Task 2).

---

### Task 1: Visible browser preset

**Files:**
- Modify: `src/features/settings/OutsideTools.tsx:10` (drop `--headless` from `BROWSER_PRESET.command`)
- Test: `src/features/settings/OutsideTools.test.tsx:281`
- Docs: `docs/decisions/0027-*.md` (Consequences: a Chromium window opens; add `--headless` to hide it), `docs/user-guide.md` Browser checks section (existing servers: remove and add again from the preset), CHANGELOG

- [ ] **Step 1:** Change the test to `expect(BROWSER_PRESET.command).not.toContain("--headless")`; run `npx vitest run src/features/settings/OutsideTools.test.tsx`; expect FAIL.
- [ ] **Step 2:** Remove `--headless` from the preset; run the test; expect PASS.
- [ ] **Step 3:** Docs, gate, commit `M6: Browser checks preset shows the browser window`.

Skipped: a "Show the browser" switch. The command line already is that switch; add one if users ask.

### Task 2: Per-task "Run commands without asking"

**Files:**
- Modify: `src-tauri/src/commands/chat.rs:88-135` (`review_at_end: bool` → `options: AgentOptions`)
- Modify: `src-tauri/src/tools/agent.rs` (`AgentRun.run_commands: bool`; `RunCommand` branch)
- Modify: `src-tauri/src/tools/mod.rs` (`AgentOptions` type next to `ToolAction`)
- Modify: `src/features/workspace/store.ts` (`runCommands: boolean`, `setRunCommands`, reset with `reviewAtEnd`), `src/features/workspace/AiPanel.tsx` (switch + confirm), `src/features/chat/store.ts:86,429` (`extra.runCommands`)
- Test: `src-tauri/tests/agent.rs`, `src/features/workspace/AiPanel.test.tsx`

**Interfaces:**
- Produces: `#[derive(Deserialize, Type)] #[serde(rename_all = "camelCase")] pub struct AgentOptions { pub review_at_end: bool, pub run_commands: bool }` in `tools/mod.rs`; `run_agent(..., messages, options: AgentOptions, on_event)`; TS `commands.runAgent(conn, model, history, { reviewAtEnd, runCommands }, channel)`.
- Produces: in `agent.rs`, `fn command_asks(args: &AgentRun, command: &str) -> bool` = `!(args.run_commands || (args.command_allowed)(command))` (Task 3 adds `command_allowed`; in this task it is `!args.run_commands`).

- [ ] **Step 1: Failing Rust test** `run_commands_without_asking_skips_the_card` in `tests/agent.rs`, copied from `run_without_asking_server_skips_the_card`: fake provider asks `run_command {"command":"echo hi"}` then answers "done"; `run_commands: true`; nobody answers; within 30 s the events include `ToolCall{action: RunCommand{..}, needs_answer: false}` and a `ToolResult` whose outcome is `Command{exit_code: Some(0), ..}` with output containing `hi`.
- [ ] **Step 2:** `cargo test --test agent run_commands_without_asking` → FAIL (field missing).
- [ ] **Step 3:** Add `AgentOptions`, the field, and in the `RunCommand` branch `let rx = command_asks(&args, &command).then(|| args.approvals.register(id));`, `needs_answer: rx.is_some()`, `edit_answer(args.approvals, id, rx, &args.cancel)`. Add `run_commands: false` to every other `AgentRun` literal.
- [ ] **Step 4:** Test passes; the existing command tests still ask.
- [ ] **Step 5: Failing UI test** in `AiPanel.test.tsx`: checking "Run commands without asking" shows a dialog titled "Run commands without asking?"; Cancel leaves it unchecked; confirming checks it; sending passes `{ reviewAtEnd: false, runCommands: true }` to `runAgent`; after the run resolves the box is unchecked again.
- [ ] **Step 6:** Implement: checkbox beside Review at end (agent mode only, disabled while streaming), `ConfirmDialog` (exists in `features/workspace/ConfirmDialog.tsx`) with message "Commands the agent asks for run straight away, as you, inside this folder, for this task only. A file or page the agent reads could steer it into a harmful command. Each one still shows on a card and Stop ends it."; turning off needs no dialog; AiPanel sets it off once the agent reply ends. Regenerate bindings.
- [ ] **Step 7:** Gate, commit `M6: run commands without asking for one task (decision 0030)`.

### Task 3: Remember allowed commands per folder

**Files:**
- Modify: `src-tauri/src/db/mod.rs` (migration 9; version asserts → 9)
- Create: `src-tauri/src/db/commands.rs`
- Modify: `src-tauri/src/connections.rs` (`Services` wrappers), `src-tauri/src/commands/tools.rs` (3 commands), `src-tauri/src/lib.rs` (register), `src-tauri/src/commands/chat.rs` (pass the check), `src-tauri/src/tools/agent.rs`
- Modify: `src/features/workspace/ToolStepView.tsx` (third button), `src/features/settings/` (new `AllowedCommands.tsx` section on the Settings screen beside Outside tools)
- Test: `db/commands.rs` unit tests, `tests/agent.rs`, `ToolStepView.test.tsx`, `AllowedCommands.test.tsx`

**Interfaces:**
- Migration 9: `CREATE TABLE allowed_commands (folder TEXT NOT NULL, command TEXT NOT NULL, PRIMARY KEY (folder, command));`
- `db::commands`: `allow(conn, folder: &str, command: &str) -> rusqlite::Result<()>` (INSERT OR IGNORE, command trimmed), `is_allowed(conn, folder, command) -> rusqlite::Result<bool>` (trimmed, exact), `list(conn) -> rusqlite::Result<Vec<AllowedCommand>>` ordered by folder then command, `remove(conn, folder, command) -> rusqlite::Result<usize>`.
- `#[derive(Serialize, Type)] #[serde(rename_all = "camelCase")] pub struct AllowedCommand { pub folder: String, pub command: String }`
- `folder` is `workspace::display_path(&root)`.
- Commands: `allow_command(workspace, services, command: String) -> Result<(), AppError>` (current folder; error "Open a folder first." when none), `list_allowed_commands(services) -> Result<Vec<AllowedCommand>, AppError>`, `remove_allowed_command(services, folder: String, command: String) -> Result<(), AppError>` (NotFound when 0 rows).
- `AgentRun.command_allowed: &'a (dyn Fn(&str) -> bool + Send + Sync)`; `run_agent` passes `&|c| services.is_command_allowed(&folder, c)` (a db error counts as not allowed). Checked per call, so "Always allow" applies to the next call in the same task.

- [ ] **Step 1: Failing db test** `allowed_command_is_exact`: after `allow(f, "npm test")`: `is_allowed(f, "  npm test\n")` true; `is_allowed(f, "npm test && del /q *")` false; `is_allowed(f, "npm  test")` false; `is_allowed(other_folder, "npm test")` false; `remove` then `is_allowed` false; `list` returns one `AllowedCommand` before the remove.
- [ ] **Step 2:** FAIL; implement migration 9 and `db/commands.rs`; PASS.
- [ ] **Step 3: Failing agent test** `allowed_command_skips_the_card`: `command_allowed: &|c| c == "echo hi"`, `run_commands: false`; `echo hi` runs with `needs_answer: false`; a second call `echo bye` in the same reply gets `needs_answer: true` (answer it `false` from the test).
- [ ] **Step 4:** Implement `command_asks` with the check; PASS.
- [ ] **Step 5: Failing UI tests:** the Run card (runCommand only, not mcpTool) shows "Always allow" which calls `allowCommand(command)` then `answerTool(id, true)`; Settings lists allowed commands grouped by folder, and Remove calls `removeAllowedCommand(folder, command)` and drops the row.
- [ ] **Step 6:** Implement; regenerate bindings; PASS.
- [ ] **Step 7:** Gate, commit `M6: remember allowed commands per folder (decision 0030)`.

### Task 4: Servers that keep running (Rust)

**Files:**
- Create: `src-tauri/src/tools/servers.rs`
- Modify: `src-tauri/src/tools/command.rs` (make `Job`, `kill_tree`, `shell_command` reusable; they already are `pub(crate)`)
- Modify: `src-tauri/src/tools/mod.rs` (3 specs, `ToolAction::StartServer`, `ToolAction::ServerOutput`, `ToolAction::StopServer`, `ToolOutcome::Server`), `src-tauri/src/tools/run.rs` (parse the 3 tools), `src-tauri/src/tools/agent.rs` (branches), `src-tauri/src/commands/terminal.rs` (3 commands), `src-tauri/src/commands/workspace.rs` (stop all on folder change/close), `src-tauri/src/lib.rs` (manage `Servers`, stop all on `RunEvent::Exit`)
- Test: `servers.rs` unit tests, `tests/agent.rs`

**Interfaces:**
- `pub struct Servers` (managed state, `Default`): `async fn start(&self, root: &Path, command: &str) -> Result<u32, WorkspaceError>`; `fn output(&self, id: u32) -> Option<ServerStatus>`; `async fn stop(&self, id: u32) -> bool`; `async fn stop_all(&self)`; `fn list(&self) -> Vec<ServerInfo>`; `fn attach(&self, id: u32, out: Channel<TerminalEvent>) -> bool` (sends the kept output, then streams; replaces an earlier channel; sends `Exit` if already ended).
- `pub struct ServerStatus { pub output: String, pub exit_code: Option<i32>, pub running: bool }`; `#[derive(Serialize, Type)] pub struct ServerInfo { pub id: u32, pub command: String, pub running: bool }` (camelCase).
- Output kept: last 64 KB (`SERVER_KEEP = 64 * 1024`), stdout and stderr in arrival order. Ids start at 1 and never repeat in an app run.
- Each server is a `shell_command` child, stdin null, piped, `current_dir(root)`, in its own `Job` on Windows / process group elsewhere; `stop` = `kill_tree` + drop job. `Drop for Servers` ends every server synchronously (job close; `kill -KILL -pgid` elsewhere).
- Tools (descriptions are the copy):
  - `start_server {command}`: "Start a command that keeps running, such as a dev server, in a terminal tab the user can see. Asks like run_command. Returns the server number and its output after up to 10 seconds (sooner once it prints an http:// address)."
  - `server_output {server}`: "The latest output of a server you started, and whether it is still running." No approval.
  - `stop_server {server}`: "Stop a server you started." No approval.
- `start_server` asks exactly like `run_command` (`command_asks`). Its card is `ToolAction::StartServer { command, folder }`; result `ToolOutcome::Server { server: u32, output: String }` (output = first ≤10 s, tail-limited by `text_limit`).
- `AgentRun.servers: Option<&'a Servers>`; `None` (tests that don't need it, the Chat surface) → the three tools are left out of `specs`.
- `OUTSIDE_TOOLS_NOTE`: replace the two sentences about the terminal with "Start a web server with start_server, wait for its address in the output, then open it with the browser tools." `run_command` description gains "For anything that keeps running, such as a dev server, use start_server." `system_prompt_note` test: note contains `start_server`, not `terminal`.

- [ ] **Step 1: Failing unit tests** in `servers.rs` (`#[tokio::test]`, a temp folder):
  - `server_keeps_running_and_stops`: start a command that prints `ready` then sleeps 60 s (`ping -n 60 127.0.0.1 >nul` after `echo ready` on Windows, `echo ready; sleep 60` elsewhere); within 5 s `output(id)` contains `ready` and `running`; `stop(id)` → true; within 5 s `running == false`.
  - `server_exit_is_reported`: `exit 3` → `running == false`, `exit_code == Some(3)`.
  - `server_output_keeps_the_tail`: a command printing 200 KB → kept output ≤ 64 KB + marker and ends with the last line.
  - `dropping_servers_ends_them`: start the sleeper, record its pid, drop `Servers`; within 5 s the pid is gone (Windows: `tasklist /FI "PID eq n"` has no row; elsewhere `kill -0` fails).
- [ ] **Step 2:** FAIL (module missing); implement `servers.rs`; PASS.
- [ ] **Step 3: Failing agent test** `start_server_returns_its_number`: `run_commands: true`; model calls `start_server {"command": "echo http://localhost:5173 && <sleep>"}`; result is `Server{server: 1, output}` containing `http://localhost:5173` in under 10 s; then `stop_server {"server":1}` → `Ok`; the run ends with no server running.
- [ ] **Step 4:** Implement specs, parse, actions, branches, note; register `Servers`; stop all on folder change and on Exit; three commands `server_list`, `server_attach(id, on_event: Channel<TerminalEvent>) -> bool`, `server_stop(id) -> bool`; regenerate bindings; PASS.
- [ ] **Step 5:** Gate, commit `M6: the agent starts servers that keep running (decision 0030)`.

### Task 5: Server tabs in the terminal panel

**Files:**
- Modify: `src/features/workspace/TerminalPanel.tsx` (tab strip: "Terminal" plus one tab per server, label = command shortened to 30 chars, dot green/grey for running, × stops a running server or closes an ended one), `src/features/workspace/store.ts` (`serverTab: number | null`, `serversVersion: number`, `showServer(id)` opens the terminal panel and selects that tab), `src/features/chat/store.ts` (on a `server` outcome call `useWorkspaceStore.getState().showServer(outcome.server)`), `src/features/workspace/ToolStepView.tsx` (labels "Start server", "Server output", "Stop server"; StartServer uses the Run card with Run/Deny/Always allow; Server outcome shows "Running in the terminal, server N" plus the output)
- Test: `TerminalPanel.test.tsx`, `ToolStepView.test.tsx`, `store.test.ts`

**Interfaces:**
- Consumes Task 4: `commands.serverList()`, `commands.serverAttach(id, channel)`, `commands.serverStop(id)`, `ToolAction` variants `startServer`/`serverOutput`/`stopServer`, outcome `server`.
- A server tab mounts its own read-only xterm (`mountTerminal` with no `onInput`) and attaches; switching tabs keeps the shell terminal alive (hide, don't unmount).

- [ ] **Step 1: Failing tests:** `showServer(2)` sets `terminalOpen` and `serverTab` to 2; the panel lists servers from `serverList` and attaches the selected one; × on a running tab calls `serverStop`; a `server` outcome in the chat store calls `showServer`.
- [ ] **Step 2:** Implement; PASS.
- [ ] **Step 3:** Docs for Tasks 2–5 in one go: decision `docs/decisions/0030-commands-without-asking-and-agent-servers.md` (context, options from the human's three answers, choice, why); AGENTS.md §6 workspace rule 4 and the "Never" line, design.md (rule 4, data model "Six" → count with `allowed_commands`, threat table row, M4/M6 checklist wording), security.md, user-guide (the switch, Always allow and where to remove, server tabs, Browser checks without starting the server yourself), README, CHANGELOG, known-issues entry "The agent can't keep a server running" marked solved by start_server.
- [ ] **Step 4:** Gate, commit `M6: server tabs in the terminal panel`; session log; `progress.md`.
- [ ] **Step 5:** Live check with the human: Test folder, Browser checks with a visible window, agent starts `node server.js` with `start_server`, tests the page.

Out of scope (later, own task): screenshots on browser cards (image tool results through the three adapters, decision 0027 D5).
