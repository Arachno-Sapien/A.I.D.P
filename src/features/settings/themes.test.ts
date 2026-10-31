import { describe, expect, it } from "vitest";
import { THEMES, contrast } from "./themes";

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

describe("themes", () => {
  it("lists the six themes", () => {
    expect(Object.keys(THEMES).sort()).toEqual([
      "cyber",
      "dark",
      "elegant",
      "glass",
      "light",
      "soft",
    ]);
  });

  it("every theme has the full ramp, an accent and a base", () => {
    for (const [id, t] of Object.entries(THEMES)) {
      for (const step of STEPS) {
        expect(t.vars[`--color-neutral-${step}`], `${id} ${step}`).toMatch(
          /^#[0-9a-f]{6}([0-9a-f]{2})?$/,
        );
      }
      expect(t.vars["--color-accent"], id).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.vars["--color-accent-fg"], id).toMatch(/^#[0-9a-f]{6}$/);
      expect(["dark", "light"]).toContain(t.base);
      expect(t.swatch).toHaveLength(3);
      // An open dropdown list is drawn over white: its colour must be solid.
      expect(t.vars["--color-popup"], `${id} popup`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("text is readable in every theme", () => {
    for (const [id, t] of Object.entries(THEMES)) {
      const v = (step: number) => t.vars[`--color-neutral-${step}`];
      for (const surface of [950, 900]) {
        expect(
          contrast(v(100), v(surface), t.backdrop),
          `${id}: body text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(v(400), v(surface), t.backdrop),
          `${id}: secondary text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(v(100), t.vars["--color-popup"]),
        `${id}: text in an open dropdown`,
      ).toBeGreaterThanOrEqual(4.5);
      if (t.backdrop) {
        expect(contrast(v(400), t.backdrop), `${id}: secondary text on the backdrop`).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(t.vars["--color-accent-fg"], t.vars["--color-accent"]),
        `${id}: text on the accent`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("contrast follows WCAG and judges a see-through surface over its backdrop", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrast("#ffffff", "#00000080", "#ffffff")).toBeLessThan(
      contrast("#ffffff", "#000000"),
    );
  });
});
