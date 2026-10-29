import { describe, expect, it } from "vitest";
import type { DirEntry } from "../../lib/bindings";
import { flattenTree } from "./tree";

describe("tree", () => {
  it("flattens expanded folders depth-first", () => {
    const children: Record<string, DirEntry[]> = {
      "": [
        { name: "src", path: "src", isDir: true },
        { name: "b.txt", path: "b.txt", isDir: false },
      ],
      src: [{ name: "a.ts", path: "src/a.ts", isDir: false }],
    };

    // When src is expanded
    const expanded: Record<string, true> = { src: true };
    const flatExpanded = flattenTree(children, expanded);
    expect(flatExpanded).toEqual([
      {
        entry: { name: "src", path: "src", isDir: true },
        depth: 0,
      },
      {
        entry: { name: "a.ts", path: "src/a.ts", isDir: false },
        depth: 1,
      },
      {
        entry: { name: "b.txt", path: "b.txt", isDir: false },
        depth: 0,
      },
    ]);

    // When src is collapsed
    const flatCollapsed = flattenTree(children, {});
    expect(flatCollapsed).toEqual([
      {
        entry: { name: "src", path: "src", isDir: true },
        depth: 0,
      },
      {
        entry: { name: "b.txt", path: "b.txt", isDir: false },
        depth: 0,
      },
    ]);
  });
});
