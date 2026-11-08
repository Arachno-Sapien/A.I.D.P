// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirEntry } from "../../lib/bindings";
import { FileTree, type FileTreeProps } from "./FileTree";

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

describe("FileTree actions", () => {
  const src: DirEntry = { name: "src", path: "src", isDir: true };
  const a: DirEntry = { name: "a.ts", path: "a.ts", isDir: false };
  const b: DirEntry = { name: "b.ts", path: "src/b.ts", isDir: false };

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  function setup(props: Partial<FileTreeProps> = {}) {
    const handlers = {
      onToggleDir: vi.fn(),
      onOpenFile: vi.fn(),
      onMenu: vi.fn(),
      onStartRename: vi.fn(),
      onDelete: vi.fn(),
      onRename: vi.fn(),
      onRenameCancel: vi.fn(),
      onMove: vi.fn(),
    };
    const utils = render(
      <div style={{ height: "600px", width: "280px" }}>
        <FileTree
          childrenMap={{ "": [src, a], src: [b] }}
          expanded={{ src: true }}
          {...handlers}
          {...props}
        />
      </div>,
    );
    const row = (name: string) => utils.getByText(name).closest("[data-tree-row]") as HTMLElement;
    const tree = utils.container.querySelector("[data-file-tree]") as HTMLElement;
    return { ...utils, ...handlers, row, tree };
  }

  it("rows take focus and answer Enter, Space, F2, Delete and the menu keys", () => {
    const t = setup();
    expect(t.row("a.ts").tabIndex).toBe(0);
    fireEvent.keyDown(t.row("a.ts"), { key: "Enter" });
    expect(t.onOpenFile).toHaveBeenCalledWith("a.ts");
    fireEvent.keyDown(t.row("src"), { key: " " });
    expect(t.onToggleDir).toHaveBeenCalledWith("src");
    fireEvent.keyDown(t.row("a.ts"), { key: "F2" });
    expect(t.onStartRename).toHaveBeenCalledWith(a);
    fireEvent.keyDown(t.row("a.ts"), { key: "Delete" });
    expect(t.onDelete).toHaveBeenCalledWith(a);
    fireEvent.keyDown(t.row("a.ts"), { key: "F10", shiftKey: true });
    fireEvent.keyDown(t.row("a.ts"), { key: "ContextMenu" });
    expect(t.onMenu).toHaveBeenCalledTimes(2);
    expect(t.onMenu).toHaveBeenLastCalledWith(a, expect.any(Number), expect.any(Number));
  });

  it("right-click opens the menu for a row, or for the top folder below the rows", () => {
    const t = setup();
    fireEvent.contextMenu(t.row("b.ts"), { clientX: 30, clientY: 40 });
    expect(t.onMenu).toHaveBeenLastCalledWith(b, 30, 40);
    fireEvent.contextMenu(t.tree, { clientX: 5, clientY: 500 });
    expect(t.onMenu).toHaveBeenLastCalledWith(null, 5, 500);
    expect(t.onMenu).toHaveBeenCalledTimes(2);
  });

  it("renames in place with the name before its extension selected", () => {
    const t = setup({ renaming: "a.ts" });
    const box = t.getByRole("textbox", { name: "New name for a.ts" }) as HTMLInputElement;
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 1]);

    fireEvent.change(box, { target: { value: "b.ts" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(t.onRename).toHaveBeenCalledWith("a.ts", "b.ts");
    expect(t.onOpenFile).not.toHaveBeenCalled();
  });

  it("Escape or an unchanged name cancels the rename", () => {
    const t = setup({ renaming: "a.ts" });
    fireEvent.keyDown(t.getByRole("textbox"), { key: "Escape" });
    expect(t.onRenameCancel).toHaveBeenCalledTimes(1);
    cleanup();

    const u = setup({ renaming: "a.ts" });
    fireEvent.keyDown(u.getByRole("textbox"), { key: "Enter" });
    expect(u.onRenameCancel).toHaveBeenCalledTimes(1);
    expect(t.onRename).not.toHaveBeenCalled();
    expect(u.onRename).not.toHaveBeenCalled();
  });

  describe("dragging", () => {
    function drag(t: ReturnType<typeof setup>, name: string, over: HTMLElement, move = 40) {
      document.elementFromPoint = vi.fn(() => over);
      fireEvent.mouseDown(t.row(name), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { clientX: 10, clientY: 10 + move });
      fireEvent.mouseUp(document, { clientX: 10, clientY: 10 + move });
    }

    it("a file dropped on a folder moves into it, with no click after", () => {
      const t = setup();
      drag(t, "a.ts", t.row("src"));
      expect(t.onMove).toHaveBeenCalledWith("a.ts", "src");
      fireEvent.click(t.row("a.ts"));
      expect(t.onOpenFile).not.toHaveBeenCalled();
    });

    it("dropped on a file it goes to that file's folder; below the rows, to the top", () => {
      const t = setup();
      drag(t, "a.ts", t.row("b.ts"));
      expect(t.onMove).toHaveBeenLastCalledWith("a.ts", "src");
      drag(t, "b.ts", t.tree);
      expect(t.onMove).toHaveBeenLastCalledWith("src/b.ts", "");
    });

    it("its own folder, a folder into itself, or a small wiggle moves nothing", () => {
      const t = setup();
      drag(t, "b.ts", t.row("src"));
      drag(t, "src", t.row("b.ts"));
      drag(t, "a.ts", t.row("src"), 2);
      drag(t, "a.ts", document.body);
      expect(t.onMove).not.toHaveBeenCalled();
    });

    it("shows where it will land, and Escape cancels", () => {
      const t = setup();
      document.elementFromPoint = vi.fn(() => t.row("src"));
      fireEvent.mouseDown(t.row("a.ts"), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { clientX: 10, clientY: 60 });
      expect(t.row("src").hasAttribute("data-drop-target")).toBe(true);
      expect(document.querySelector("[data-drag-label]")?.textContent).toBe("a.ts");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.querySelector("[data-drag-label]")).toBeNull();
      fireEvent.mouseUp(document, { clientX: 10, clientY: 60 });
      expect(t.onMove).not.toHaveBeenCalled();
    });
  });
});
