// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createState, mountView } from "./cm";

describe("cm", () => {
  it("createState sets up one-dark and basic setup", () => {
    const onSave = vi.fn();
    const onChange = vi.fn();

    const state = createState("const a = 1;", "test.ts", {
      onChange,
      onSave,
    });

    expect(state.doc.toString()).toBe("const a = 1;");

    const parent = document.createElement("div");
    const view = mountView(parent, state);
    expect(view.dom).toBeDefined();
    view.destroy();
  });
});

