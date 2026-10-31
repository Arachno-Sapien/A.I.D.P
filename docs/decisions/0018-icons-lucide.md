# Decision Record 0018: Icon library (lucide-react)

**Date:** 2026-10-31
**Status:** Accepted (the human approved D1 of the chat list and icons plan on 2026-10-31)

---

## Context

Before `0.1.0-rc.2`, the user interface used plain text buttons for most navigation and toolbars (e.g. Chat, Workspace, Models, Settings in the top bar; Files, AI, Terminal, Refresh, Close folder in the workspace bar) or raw inline SVGs (like the trash icon in `ConversationList`). Adding recognizable icons clarifies controls, saves horizontal space in tight toolbars, and improves visual hierarchy.

## Options considered

1. **`lucide-react` 1.66 (chosen):**
   - Active, comprehensive icon library with consistent 24x24 viewBox.
   - ISC licensed with zero runtime dependencies.
   - Declares `sideEffects: false`, so Vite/Rollup tree-shakes all unused icons; each imported icon adds ~1 KB to the production bundle.
2. **`heroicons` (rejected):**
   - Smaller selection (~300 icons) and fewer specialized editor/terminal icons.
3. **Hand-copied inline SVGs (rejected):**
   - Avoids adding a dependency, but requires copying, cleaning, and maintaining raw SVG paths manually for every icon.

## Decision

Adopt `lucide-react` 1.66.0 for UI icons.
- Top nav: icon and label (`MessageSquare`, `FolderCode`, `Boxes`, `Settings`).
- Workspace bar: icon only with accessible tooltip and aria-label (`PanelLeft`, `MessagesSquare`, `SquareTerminal`, `RotateCw`, `FolderX`).
- Chat list: icon-only list toggle, icon + text "New chat" (`SquarePen`), and icon-only row actions (`Trash2`, `Pin`, `PinOff`, `Archive`, `ArchiveRestore`).
- Icon size is 16 px in bars/nav and 14 px in list rows, with `aria-hidden="true"`.
