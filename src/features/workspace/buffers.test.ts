import { EditorSelection, EditorState } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";
import { buffers } from "./buffers";

describe("buffers", () => {
  beforeEach(() => {
    buffers.clear();
  });

  it("tracks dirty state and saved text", () => {
    const initialText = "line 1\nline 2\nline 3";
    const state = EditorState.create({ doc: initialText });
    buffers.set("a.ts", state);

    // Initial state is not dirty
    expect(buffers.isDirty("a.ts")).toBe(false);
    expect(buffers.text("a.ts")).toBe(initialText);

    // Edit the text
    const editedState = state.update({
      changes: { from: 0, to: 6, insert: "first line" },
    }).state;
    buffers.set("a.ts", editedState);

    // Now it is dirty
    expect(buffers.isDirty("a.ts")).toBe(true);

    // Mark saved
    buffers.markSaved("a.ts");
    expect(buffers.isDirty("a.ts")).toBe(false);

    // Test selection (empty -> null)
    expect(buffers.selection("a.ts")).toBeNull();

    // Set selection covering "first" on line 1 to part of line 2
    const withSelection = editedState.update({
      selection: EditorSelection.single(0, 15),
    }).state;
    buffers.set("a.ts", withSelection);

    const sel = buffers.selection("a.ts");
    expect(sel).not.toBeNull();
    expect(sel?.text).toBe(withSelection.sliceDoc(0, 15));
    expect(sel?.fromLine).toBe(1);
    expect(sel?.toLine).toBe(2);
  });
});

