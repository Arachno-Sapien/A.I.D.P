// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirEntry } from "../../lib/bindings";
import { FileTree } from "./FileTree";

describe("FileTree", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a window of rows for 10,000 entries", () => {
    const tenThousandFiles: DirEntry[] = Array.from(
      { length: 10000 },
      (_, i) => ({
        name: `file-${i}.txt`,
        path: `file-${i}.txt`,
        isDir: false,
      }),
    );

    const { container } = render(
      <div style={{ height: "600px", width: "280px" }}>
        <FileTree
          childrenMap={{ "": tenThousandFiles }}
          expanded={{}}
          onToggleDir={vi.fn()}
          onOpenFile={vi.fn()}
        />
      </div>,
    );

    const rows = container.querySelectorAll("[data-tree-row]");
    expect(rows.length).toBeLessThan(60);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("clicking a folder toggles it, a file opens it", () => {
    const onToggleDir = vi.fn();
    const onOpenFile = vi.fn();

    const items: DirEntry[] = [
      { name: "src", path: "src", isDir: true },
      { name: "b.txt", path: "b.txt", isDir: false },
    ];

    const { getByText } = render(
      <div style={{ height: "600px", width: "280px" }}>
        <FileTree
          childrenMap={{ "": items }}
          expanded={{}}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      </div>,
    );

    fireEvent.click(getByText("src"));
    expect(onToggleDir).toHaveBeenCalledWith("src");

    fireEvent.click(getByText("b.txt"));
    expect(onOpenFile).toHaveBeenCalledWith("b.txt");
  });
});
