# Decision Record 0020: Themes

**Date:** 2026-11-01
**Status:** Accepted (the human chose the five directions and approved the themes plan, T1 to T7, on 2026-11-01)

---

## Context

The app had Dark, Light and System. The human asked to polish the UI with "good themes/morphisms". From mock-ups they chose refined flat, Glass and Soft (neumorphic), and added Cyber/digital and Elegant. Light already worked by redefining Tailwind's neutral colour variables under `:root[data-theme="light"]`, so every component written with `bg-neutral-950` or `text-neutral-100` followed it for free.

## Options considered

1. **A theme table of variables, plus one effects stylesheet (chosen).** Each theme is a set of values for Tailwind's variables. Components keep their classes. The few effects colour can't give (blur, soft shadows, glow, serif headings) hang off four hook classes in one stylesheet keyed by `data-theme`.
2. **Theme classes in every component** (`dark:`/`glass:` variants or per-theme class names). This means touching every element for each theme, and seven themes multiply the work.
3. **A component library with themes.** AGENTS.md rules this out (Tailwind, no component library), and it would cost memory.

## Decision

- **Seven entries in Settings:** System, Dark, Light, Glass, Soft, Cyber, Elegant. System follows the OS between Dark and Light.
- **One table holds every theme's colours:** `src/features/settings/themes.ts` (`THEMES`). It has the full `--color-neutral-50` to `-950` ramp, an accent and its text colour, and the font variables a theme changes. Light's colours moved out of `App.css` into it.
- **`applyTheme` paints the theme:**
  - it writes the theme's variables on `:root` and clears any the previous theme set but this one doesn't;
  - it sets `data-theme` to the theme's name and `data-base` to `dark` or `light`;
  - it still returns the base, which the editor, the diff view and the terminal follow.
- **Each theme has a base:** dark for Glass, Soft and Cyber; light for Elegant.
- **Readability is tested:** body text (`neutral-100`) and secondary text (`neutral-400`) must reach 4.5:1 on both main surfaces (`neutral-950`, `neutral-900`), and the accent's text must reach 4.5:1 on the accent. Glass's see-through surfaces (78–85% opaque) are judged over the lightest colour of its backdrop.
- **System fonts only:** a serif stack for Elegant's headings and a monospace stack for Cyber's labels, so nothing is downloaded or allowed in the CSP.
- **Rust stores the name as before:** a string in the `settings` table. An unknown name, from a typo or a newer version, starts the app in Dark.

## Consequences

- **Adding a theme is local:** an entry in `THEMES`, a `Theme` variant in Rust, and any effects in the stylesheet. The contrast test checks it.
- **Classes outside the ramp don't follow a theme.** A component that uses colours other than the neutral ramp, the accent, white and black, or the three status colours keeps its colour in every theme.
