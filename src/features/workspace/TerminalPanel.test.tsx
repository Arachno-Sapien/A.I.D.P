// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let mockTermOnInput: ((data: string) => void) | null = null;
let mockTermOnResize: ((cols: number, rows: number) => void) | null = null;
const mockTermWrite = vi.fn();
const mockTermFit = vi.fn();
const mockTermDispose = vi.fn();

vi.mock("./term", () => ({
  mountTerminal: vi.fn().mockImplementation((_el, opts) => {
    mockTermOnInput = opts.onInput;
    mockTermOnResize = opts.onResize;
    return {
      write: mockTermWrite,
      fit: mockTermFit,
      dispose: mockTermDispose,
      cols: 80,
      rows: 24,
    };
  }),
}));

let lastChannel: any = null;
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
    constructor() {
      lastChannel = this;
    }
  },
}));

vi.mock("../../lib/bindings", () => ({
  commands: {
    terminalOpen: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    terminalWrite: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    terminalResize: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    terminalClose: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

import { commands } from "../../lib/bindings";
import { TerminalPanel } from "./TerminalPanel";
import { useWorkspaceStore } from "./store";

afterEach(() => {
  cleanup();
});

describe("TerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastChannel = null;
    mockTermOnInput = null;
    mockTermOnResize = null;
  });

  it("opens with the fitted size", () => {
    render(<TerminalPanel />);

    expect(commands.terminalOpen).toHaveBeenCalledWith(
      80,
      24,
      expect.anything(),
    );
  });

  it("streams output and input", () => {
    render(<TerminalPanel />);

    expect(lastChannel).not.toBeNull();
    act(() => {
      lastChannel.onmessage({ event: "output", data: "hi" });
    });
    expect(mockTermWrite).toHaveBeenCalledWith("hi");

    expect(mockTermOnInput).not.toBeNull();
    mockTermOnInput?.("ls\r");
    expect(commands.terminalWrite).toHaveBeenCalledWith("ls\r");
  });

  it("closes on unmount", () => {
    useWorkspaceStore.setState({
      info: { name: "test", path: "/test", isGit: true },
    });

    const { unmount } = render(<TerminalPanel />);
    unmount();

    expect(commands.terminalClose).toHaveBeenCalled();
    expect(mockTermDispose).toHaveBeenCalled();
  });

  it("offers restart after exit", () => {
    render(<TerminalPanel />);

    expect(lastChannel).not.toBeNull();
    act(() => {
      lastChannel.onmessage({ event: "exit" });
    });

    expect(mockTermWrite).toHaveBeenCalledWith("\r\n[process exited]");
    expect(screen.getByText(/process exited/i)).toBeDefined();

    const restartBtn = screen.getByRole("button", { name: /restart/i });
    fireEvent.click(restartBtn);

    expect(commands.terminalOpen).toHaveBeenCalledTimes(2);
  });

  it("forwards terminal resize events", () => {
    render(<TerminalPanel />);

    expect(mockTermOnResize).not.toBeNull();
    mockTermOnResize?.(120, 40);

    expect(commands.terminalResize).toHaveBeenCalledWith(120, 40);
  });

  it("shows error when terminalOpen fails", async () => {
    vi.mocked(commands.terminalOpen).mockResolvedValueOnce({
      status: "error",
      error: { kind: "noFolder" },
    });

    render(<TerminalPanel />);

    expect(await screen.findByText("No folder is currently open.")).toBeDefined();
  });
});
