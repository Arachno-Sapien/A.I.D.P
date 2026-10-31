import type { Theme } from "../../lib/bindings";
import { THEMES, type ThemeId } from "./themes";

/** The theme shown: System follows the OS between Dark and Light; an unknown name is Dark. */
export function themeId(theme: Theme, prefersDark: boolean): ThemeId {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme in THEMES ? theme : "dark";
}

/** The base the editor and terminal follow. */
export function resolveTheme(
  theme: Theme,
  prefersDark: boolean,
): "dark" | "light" {
  return THEMES[themeId(theme, prefersDark)].base;
}

/** Every variable any theme sets, so a switch clears what the next one doesn't. */
const ALL_VARS = [...new Set(Object.values(THEMES).flatMap((t) => Object.keys(t.vars)))];

function paint(id: ThemeId) {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  const spec = THEMES[id];
  for (const name of ALL_VARS) {
    const value = spec.vars[name];
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  root.dataset.theme = id;
  root.dataset.base = spec.base;
}

let activeMediaQuery: MediaQueryList | null = null;
let activeListener: ((e: MediaQueryListEvent) => void) | null = null;
let onSystemChangeCallback:
  | ((resolved: "dark" | "light") => void)
  | null = null;

export function setSystemChangeCallback(
  cb: ((resolved: "dark" | "light") => void) | null,
) {
  onSystemChangeCallback = cb;
}

export function applyTheme(theme: Theme): "dark" | "light" {
  if (activeMediaQuery && activeListener) {
    activeMediaQuery.removeEventListener?.("change", activeListener);
    activeMediaQuery = null;
    activeListener = null;
  }

  const mq =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  const prefersDark = mq ? mq.matches : true;
  const resolved = resolveTheme(theme, prefersDark);

  paint(themeId(theme, prefersDark));

  if (theme === "system" && mq) {
    activeMediaQuery = mq;
    activeListener = (e: MediaQueryListEvent) => {
      const nextResolved = resolveTheme("system", e.matches);
      paint(themeId("system", e.matches));
      onSystemChangeCallback?.(nextResolved);
    };
    mq.addEventListener?.("change", activeListener);
  }

  return resolved;
}

