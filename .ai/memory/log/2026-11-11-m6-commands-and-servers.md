# 2026-11-11 · M6 · Visible browser, commands without asking, agent servers
Agent: Claude Code (Opus 5.5)
Task: The human wanted the browser visible "like Antigravity" and commands/servers automated; chose window now + screenshots later, per-task switch AND Always allow, servers in a terminal tab (decision 0030). Plan: docs/superpowers/plans/2026-11-11-m6-visible-browser-and-commands.md
Changed: OutsideTools.tsx (preset without --headless); run_agent takes AgentOptions {reviewAtEnd, runCommands} (specta 10-arg cap); agent.rs command_asks; migration 9 allowed_commands + db/commands.rs + allow/list/remove commands + Settings AllowedCommands.tsx + Always allow on Run cards; tools/servers.rs (job object, 64 KB tail) + start_server/server_output/stop_server + server_list/attach/stop; TerminalPanel tabs; agent hook opens the tab
Security fixes from automated reviews: Always allow ignored while Review at end is on; ended server never killed by pid; folder change stops the agent run before the servers
Decisions: 0030; rule 4 + Never line amended in AGENTS/design/security; README, user guide, CHANGELOG
Tests: agent tests for run_commands, allowed, review-at-end, start_server; servers.rs 6 unit tests; UI tests for the switch, Always allow, Settings list, server tabs. Gate: clippy clean, rust 317, vitest 379
Problems: bash heredocs mangle backslashes and quotes in patch scripts; write patch scripts with the Write tool into the scratchpad
Next: live check in the Test folder (browser window, start_server node server.js); screenshots on browser cards is its own task
