import type { Theme } from "../../lib/bindings";

export function resolveTheme(
  theme: Theme,
  prefersDark: boolean,
): "dark" | "light" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return prefersDark ? "dark" : "light";
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

  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = resolved;
  }

  if (theme === "system" && mq) {
    activeMediaQuery = mq;
    activeListener = (e: MediaQueryListEvent) => {
      const nextResolved = resolveTheme("system", e.matches);
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.dataset.theme = nextResolved;
      }
      onSystemChangeCallback?.(nextResolved);
    };
    mq.addEventListener?.("change", activeListener);
  }

  return resolved;
}

