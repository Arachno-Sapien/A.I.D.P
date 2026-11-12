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

  it("an image is read once and kept only as a small thumbnail", async () => {
    // jsdom draws no images, so decoding and the canvas are stand-ins here.
    const decode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      value: () => Promise.resolve(),
      configurable: true,
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,SMALL");
    try {
      const shot = { id: "c".repeat(64), name: "shot.png", mime: "image/png", size: 2048, kind: "image" as const, warning: null };
      const first = render(<AttachmentChip attachment={shot} />);
      const img = await screen.findByRole("img", { name: "shot.png" });
      await vi.waitFor(() => expect(img.getAttribute("src")).toBe("data:image/png;base64,SMALL"));
      first.unmount();

      // Shown again (scrolled back into view): nothing is read twice.
      render(<AttachmentChip attachment={shot} />);
      expect(screen.getByRole("img", { name: "shot.png" }).getAttribute("src")).toBe(
        "data:image/png;base64,SMALL",
      );
      expect(commands.readAttachment).toHaveBeenCalledTimes(1);
      expect(drawImage).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      if (decode) Object.defineProperty(HTMLImageElement.prototype, "decode", decode);
      else delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
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
