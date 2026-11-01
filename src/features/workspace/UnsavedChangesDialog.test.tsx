// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

afterEach(() => {
  cleanup();
});

function renderDialog(count = 2) {
  const handlers = { onCancel: vi.fn(), onDiscard: vi.fn(), onSaveAll: vi.fn() };
  const view = render(
    <UnsavedChangesDialog count={count} discardLabel="Discard and quit" {...handlers} />,
  );
  return { ...handlers, ...view };
}

describe("UnsavedChangesDialog", () => {
  it("is announced as a dialog with its title and message", () => {
    renderDialog(2);
    const dialog = screen.getByRole("dialog", { name: "Unsaved changes" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { description: "You have unsaved changes in 2 files." })).toBe(dialog);
  });

  it("says file for one file", () => {
    renderDialog(1);
    expect(screen.getByText("You have unsaved changes in 1 file.")).toBeDefined();
  });

  it("starts on Cancel, so Enter can't throw work away", () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("Escape cancels", () => {
    const { onCancel, onDiscard } = renderDialog();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("Tab and Shift+Tab stay inside the dialog", () => {
    renderDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const saveAll = screen.getByRole("button", { name: "Save all" });

    saveAll.focus();
    fireEvent.keyDown(saveAll, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(saveAll);

    // Focus that somehow left the dialog comes back on the next Tab.
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
  });

  it("the buttons do what they say", () => {
    const { onDiscard, onSaveAll } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Discard and quit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSaveAll).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to where it was when it closes", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = renderDialog();
    expect(document.activeElement).not.toBe(outside);
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
