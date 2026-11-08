// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { TreeMenu } from "./TreeMenu";

afterEach(() => {
  cleanup();
});

describe("TreeMenu", () => {
  const items = () => [
    { label: "Rename", hint: "F2", onSelect: vi.fn() },
    { label: "Delete", hint: "Del", onSelect: vi.fn() },
  ];

  it("is a named menu that starts on its first item", () => {
    render(<TreeMenu x={10} y={20} label="Actions for a.ts" items={items()} onClose={vi.fn()} />);
    const menu = screen.getByRole("menu", { name: "Actions for a.ts" });
    expect(menu.style.left).toBe("10px");
    expect(menu.style.top).toBe("20px");
    const entries = screen.getAllByRole("menuitem");
    expect(entries.map((e) => e.textContent)).toEqual(["RenameF2", "DeleteDel"]);
    expect(document.activeElement).toBe(entries[0]);
  });

  it("arrow keys move between items and wrap", () => {
    render(<TreeMenu x={0} y={0} label="m" items={items()} onClose={vi.fn()} />);
    const [rename, del] = screen.getAllByRole("menuitem");
    fireEvent.keyDown(rename!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(del!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(rename!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(del);
  });

  it("choosing an item closes the menu, then does it", () => {
    const list = items();
    const onClose = vi.fn();
    render(<TreeMenu x={0} y={0} label="m" items={list} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(list[1]!.onSelect).toHaveBeenCalledTimes(1);
    expect(list[0]!.onSelect).not.toHaveBeenCalled();
  });

  it("Escape, Tab and a click elsewhere close it", () => {
    const onClose = vi.fn();
    render(<TreeMenu x={0} y={0} label="m" items={items()} onClose={onClose} />);
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Escape" });
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Tab" });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("Escape gives focus back to what opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      <TreeMenu x={0} y={0} label="m" items={items()} onClose={vi.fn()} />,
    );
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Escape" });
    rerender(<></>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("ConfirmDialog", () => {
  it("asks with a title and message, starting on Cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete a.ts?"
        message="It goes to the Recycle Bin, where you can restore it."
        confirmLabel="Move to Recycle Bin"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete a.ts?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("It goes to the Recycle Bin, where you can restore it.").id).toBe(
      dialog.getAttribute("aria-describedby"),
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Move to Recycle Bin" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
