# Decision Record 0005: Coding Workspace in v1

**Date:** 2026-10-29
**Status:** Accepted (approved by the human on 2026-10-29)

---

## Context

The original design put the coding workspace last, after v1, because it is the largest piece. The human made clear that the coding platform is the main goal of A.I.D.P. Leaving it after v1 would ship a chat app first and the real product much later.

An AI coding workspace is an editor on top of the model layer. Streaming replies, Stop, the provider adapters, and keys in the keychain all have to exist before the workspace has an AI to talk to.

## Options Considered

1. **Keep the original order.** Chat app first, workspace after v1. Safe, but it delays the part that matters most.
2. **Workspace first, chat later.** Build the editor in M1. Without the model layer the editor has no AI, so the workspace would sit idle or end up building that layer itself.
3. **Workspace right after the model layer.** Keep M1 (streaming chat) and M2 (keys and providers), then build the workspace in M3 and agent tools in M4. Ollama management, history, and settings move to M5.

## Decision

Option 3. New milestones:

| | Milestone |
| --- | --- |
| M0 | Setup (unchanged) |
| M1 | Chat with one cloud model (unchanged) |
| M2 | Keys and providers (was Model Hub) |
| M3 | Coding workspace: folder, file tree, CodeMirror 6 editor, AI panel with file and selection context, diffs with Accept |
| M4 | Agent tools and terminal: tool calling, built-in tools, approvals, xterm.js + portable-pty |
| M5 | Ollama, history, and settings (was M3 and M4) |
| M6 | v0.1 release (was M5) |

Built-in tools are in v1. An MCP client, browser checks, and the practice area stay after v1.

## Consequences

- **New security rules.** Seven workspace and tool rules sit next to the key rules (design doc, "Workspace and tool security"; AGENTS.md section 6): one folder, file and process access through Rust only, edits as accepted diffs, approval for every model command, tool output as data, secret files kept out of prompts, and a warning in folders without git.
- **New libraries,** each added when its milestone starts: CodeMirror 6 and @codemirror/merge, the `ignore` crate (M3), xterm.js and `portable-pty` (M4).
- **Memory.** The 150 MB idle target now means no model loaded and no folder open. M3 and M4 measure RAM with a workspace open and record a budget.
- **Timeline.** v0.1 grows from about 10 to about 16 weeks at 10 to 20 hours a week (rough estimate, revisited in each phase doc).
- **Rust reading matters more.** M3 and M4 are file-system and process code, which is exactly what the human needs to be able to review.
