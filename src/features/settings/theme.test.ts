// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme } from "./theme";
import { THEMES } from "./themes";

describe("theme table", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.base;
  });

  it("applies a theme's variables, its name and its base", () => {
    const root = document.documentElement;
    applyTheme("cyber");
    expect(root.dataset.theme).toBe("cyber");
    expect(root.dataset.base).toBe("dark");
    expect(root.style.getPropertyValue("--color-accent")).toBe(
      THEMES.cyber.vars["--color-accent"],
    );

    // Light swaps white and black; a theme without that override clears it.
    applyTheme("light");
    expect(root.style.getPropertyValue("--color-white")).not.toBe("");
    applyTheme("dark");
    expect(root.style.getPropertyValue("--color-white")).toBe("");
    expect(root.dataset.base).toBe("dark");
  });

  it("Cyber resolves to dark and Elegant to light", () => {
    expect(resolveTheme("cyber", false)).toBe("dark");
    expect(resolveTheme("glass", false)).toBe("dark");
    expect(resolveTheme("elegant", true)).toBe("light");
    expect(applyTheme("elegant")).toBe("light");
    expect(applyTheme("soft")).toBe("dark");
  });
});

describe("theme", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("resolves and applies the theme", () => {
    // dark/light as is
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");

    // system follows prefersDark
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");

    // applyTheme("light") sets data-theme="light"
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    // a media change re-applies for System only
    let matchMediaListener: ((e: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_, cb) => {
        matchMediaListener = cb as any;
      }),
      removeEventListener: vi.fn((_, cb) => {
        if (matchMediaListener === cb) {
          matchMediaListener = null;
        }
      }),
      dispatchEvent: vi.fn(),
    }));

    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    // Media change to dark
    (matchMediaListener as ((e: any) => void) | null)?.({
      matches: true,
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    // Switch to explicit light
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    // Media change does NOT affect explicit theme
    (matchMediaListener as ((e: any) => void) | null)?.({
      matches: true,
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
