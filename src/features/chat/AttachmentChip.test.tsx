// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    readAttachment: vi.fn().mockResolvedValue({ status: "ok", data: "iVBORw0KGgo=" }),
  },
}));

import { commands } from "../../lib/bindings";
import { AttachmentChip, formatSize } from "./AttachmentChip";

afterEach(() => {
  cleanup();
});

describe("AttachmentChip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an image shows its thumbnail, read from Rust", async () => {
    const png = { id: "a".repeat(64), name: "shot.png", mime: "image/png", size: 2048, kind: "image" as const, warning: null };
    render(<AttachmentChip attachment={png} />);
    const img = await screen.findByRole("img", { name: "shot.png" });
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(commands.readAttachment).toHaveBeenCalledWith(png.id);
  });

  it("a file shows its name and size without being read", () => {
    const notes = { id: "b".repeat(64), name: "notes.md", mime: "text/plain", size: 5, kind: "text" as const, warning: null };
    render(<AttachmentChip attachment={notes} />);
    expect(screen.getByText("notes.md")).toBeDefined();
    expect(screen.getByText("5 B")).toBeDefined();
    expect(commands.readAttachment).not.toHaveBeenCalled();
  });

  it("sizes read naturally", () => {
    expect(formatSize(5)).toBe("5 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
