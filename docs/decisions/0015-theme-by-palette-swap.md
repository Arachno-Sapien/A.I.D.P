# Decision Record 0015: Theme support via Tailwind neutral palette swap, CodeMirror compartment, and xterm theme options

**Date:** 2026-10-30
**Status:** Accepted (the human approved default D4 on 2026-10-30)

---

## Context

The app originally defaulted to dark mode across all screens. Users on laptops or in daylight need light theme support, and users who change OS theme dynamically expect the app to follow system preferences.

## Options considered

1. **Write `dark:` prefixes across every component class in the codebase.** Highly repetitive, verbose, prone to inconsistent contrast across screens, and tedious to maintain.
2. **Palette swap via CSS custom properties on `:root[data-theme="light"]` (chosen).** In Tailwind v4, utilities like `bg-neutral-900` and `text-neutral-100` resolve through `--color-neutral-*` CSS variables. Reversing the neutral ramp flips the entire UI cleanly with minimal code changes.

## Decision

Option 2 (default D4).

- **Tailwind Neutral Palette Inversion:** In `App.css`, `:root[data-theme="light"]` reverses the neutral scale:
  - 50 ↔ 950, 100 ↔ 900, 200 ↔ 800, 300 ↔ 700, 400 ↔ 600, while 500 stays.
  - Swaps `--color-white` and `--color-black`.
  - Sets alert text colors (`--color-red-400`, `--color-amber-400`, `--color-green-400`) to darker 700 shades for legible contrast on light backgrounds.
  - Sets `color-scheme: light` on light and `color-scheme: dark` on `:root`.
- **Theme Resolution (`settings/theme.ts`):** Supports `Dark`, `Light`, and `System`. When `System` is selected, `matchMedia("(prefers-color-scheme: dark)")` determines the resolved theme and updates reactively on OS appearance changes.
- **CodeMirror Integration:** `workspace/cm.ts` wraps syntax themes in a `Compartment`. Dark mode uses `oneDark`; light mode reconfigures the compartment to empty (CodeMirror default light theme).
- **xterm Integration:** `workspace/term.ts` swaps terminal background, foreground, cursor, and selection colors between dark (`#0a0a0a`) and light (`#fafafa`).
