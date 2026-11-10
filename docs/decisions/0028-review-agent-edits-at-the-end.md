# Decision Record 0028: Review the Agent's Edits at the End

**Date:** 2026-11-10
**Status:** Accepted (the human chose "Option B" after trying a multi-file task: "The model keeps asking for acceptance for every single change")

---

## Context

Workspace rule 3 said every AI edit is a proposal that reaches the disk only when the user accepts it. For a task that touches several files (build a small site, then check it in the browser), the agent stopped at every file. Worse, a browser check or a test command could never see the files it had just written, because nothing was on disk until each one was accepted.

## Options considered

1. **Hold edits in memory, review at the end.** Keeps rule 3, but commands and browser checks run against the real files, so the agent can't test what it wrote.
2. **Write edits as they come, review and undo at the end.** A switch per task; the app keeps each file's text from before the agent's first write and offers Keep all, Undo all, and Undo per file when the agent finishes.
3. Auto-approve everything. Rejected: commands and outside tools run code and send data.

## Decision

Option 2, as a **Review at end** switch beside **Agent** in the AI panel. Off by default, and off again whenever a folder is opened or closed.

- **Decided in Rust.** `run_agent` takes `review_at_end`. With it, `edit_file` and `create_file` skip the approval wait and are written at once (unless Stop was already pressed); their step cards arrive with `needsAnswer: false`. `run_command` and every outside tool (MCP) still ask, every time.
- **The model is told.** Its system prompt says edits are written as it works and reviewed at the end, so it should finish the whole task (`EDITS_AT_END` in `tools/mod.rs`).
- **The review.** The UI collects each write from the step cards (one entry per file: text before the first write, text after the last). When the reply ends, a card lists the files with **Undo** each, **Keep all** and **Undo all**; clicking a file shows its diff in place of the editor.
- **Undo is careful.** It reads the file first and puts the old text back only if the file still holds exactly what the agent wrote; anything changed since is left alone with a message. A file the agent created goes to the Recycle Bin or Trash (decision 0024). A tab with unsaved changes blocks undo of that file.
- **No git.** In a folder that isn't a git repository, turning the switch on asks first ("edits can be undone only from the review"), once per folder, like the first accepted edit.
- **Rules changed.** Workspace rule 3 and the "Never" line in `AGENTS.md` and the design doc now allow this switch. Rule 4 (every command approved) and the outside-tool rules are unchanged.

## Why

It is the only option that lets the agent build and then test its own work, which is what the browser checks are for, while keeping a full undo of its edits and every command behind an approval.

## Limits

- The review lives in memory: closing the folder or the app keeps the edits and drops the review. Without git, that is the end of the easy undo.
- Undo restores text, not file times or permissions; a file the agent created and the user then edited is left alone.
- Commands the agent runs can change files too; those changes are not in the review.
