// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPath, NewEntry } from "./NewEntry";

afterEach(() => {
  cleanup();
});

const box = () => screen.queryByRole("textbox");

async function submit(value: string) {
  fireEvent.change(box()!, { target: { value } });
  await act(async () => {
    fireEvent.submit(box()!.closest("form")!);
  });
}

describe("NewEntry", () => {
  it("New file opens a name box in the current folder", () => {
    render(<NewEntry folder="src/app" onCreate={vi.fn()} />);
    expect(box()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(box()?.getAttribute("aria-label")).toBe("New file name");
    expect((box() as HTMLInputElement).value).toBe("src/app/");
    expect(document.activeElement).toBe(box());
  });

  it("switching from New file to New folder focuses the new box", () => {
    render(<NewEntry folder="src" onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    const folderButton = screen.getByRole("button", { name: "New folder" });
    folderButton.focus();
    fireEvent.click(folderButton);

    expect(box()?.getAttribute("aria-label")).toBe("New folder name");
    expect((box() as HTMLInputElement).value).toBe("src/");
    expect(document.activeElement).toBe(box());
  });

  it("starts empty at the top of the folder", () => {
    render(<NewEntry folder="" onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect((box() as HTMLInputElement).value).toBe("");
    expect(box()?.getAttribute("aria-label")).toBe("New folder name");
  });

  it("Enter creates it and closes the box", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<NewEntry folder="" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    await submit(" src\\util\\date.ts ");

    expect(onCreate).toHaveBeenCalledWith("file", "src/util/date.ts");
    expect(box()).toBeNull();
  });

  it("keeps the box open with the message when it can't be made", async () => {
    const onCreate = vi.fn().mockResolvedValue("A file or folder with that name already exists.");
    render(<NewEntry folder="" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    await submit("docs");

    expect(onCreate).toHaveBeenCalledWith("folder", "docs");
    expect(screen.getByRole("alert").textContent).toBe(
      "A file or folder with that name already exists.",
    );
    expect(box()).not.toBeNull();
  });

  it("asks for a name before creating anything", async () => {
    const onCreate = vi.fn();
    render(<NewEntry folder="src" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    await submit("src/");
    expect(screen.getByRole("alert").textContent).toBe("Type a name for the new file.");
    await submit("   ");
    expect(screen.getByRole("alert").textContent).toBe("Type a name for the new file.");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Escape closes the box without creating anything", () => {
    const onCreate = vi.fn();
    render(<NewEntry folder="src" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    fireEvent.keyDown(box()!, { key: "Escape" });
    expect(box()).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("cleanPath", () => {
  it("reads Windows slashes and drops a leading slash or ./", () => {
    expect(cleanPath("src\\a.ts")).toBe("src/a.ts");
    expect(cleanPath("/src/a.ts")).toBe("src/a.ts");
    expect(cleanPath("./src/a.ts")).toBe("src/a.ts");
    expect(cleanPath("  a.ts  ")).toBe("a.ts");
  });
});
