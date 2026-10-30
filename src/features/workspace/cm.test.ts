// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { createState, mountDiff, mountView, setEditorTheme } from "./cm";

describe("cm", () => {
  it("createState sets up one-dark and basic setup", () => {
    const onSave = vi.fn();
    const onUpdate = vi.fn();

    const state = createState("const a = 1;", "test.ts", {
      onUpdate,
      onSave,
    });

    expect(state.doc.toString()).toBe("const a = 1;");

    const parent = document.createElement("div");
    const view = mountView(parent, state);
    expect(view.dom).toBeDefined();
    view.destroy();
  });

  it("mountDiff creates a read-only unified merge view", () => {
    const parent = document.createElement("div");
    const view = mountDiff(parent, "const a = 1;", "const a = 2;");
    expect(view.dom).toBeDefined();
    expect(view.state.readOnly).toBe(true);
    view.destroy();
  });

  it("editor follows the theme", () => {
    const parent = document.createElement("div");
    const state = createState("const a = 1;", "test.ts");
    const view = mountView(parent, state);

    expect(view.state.facet(EditorView.darkTheme)).toBe(true);

    setEditorTheme(view, "light");
    expect(view.state.facet(EditorView.darkTheme)).toBe(false);

    setEditorTheme(view, "dark");
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);

    view.destroy();
  });
});

