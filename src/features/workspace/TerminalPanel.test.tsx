// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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
const channels: any[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
    constructor() {
      lastChannel = this;
      channels.push(this);
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
    channels.length = 0;
    mockTermOnInput = null;
    mockTermOnResize = null;
  });

  it("opens with the fitted size", async () => {
    render(<TerminalPanel />);

    await waitFor(() =>
      expect(commands.terminalOpen).toHaveBeenCalledWith(
        80,
        24,
        expect.anything(),
      ),
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

  it("closes on unmount", async () => {
    useWorkspaceStore.setState({
      info: { name: "test", path: "/test", isGit: true },
    });

    const { unmount } = render(<TerminalPanel />);
    unmount();

    await waitFor(() => expect(commands.terminalClose).toHaveBeenCalled());
    expect(mockTermDispose).toHaveBeenCalled();
  });

  it("offers restart after exit", async () => {
    render(<TerminalPanel />);

    expect(lastChannel).not.toBeNull();
    act(() => {
      lastChannel.onmessage({ event: "exit" });
    });

    expect(mockTermWrite).toHaveBeenCalledWith("\r\n[process exited]");
    expect(screen.getByText(/process exited/i)).toBeDefined();

    const restartBtn = screen.getByRole("button", { name: /restart/i });
    fireEvent.click(restartBtn);

    await waitFor(() => expect(commands.terminalOpen).toHaveBeenCalledTimes(2));
  });

  it("ignores a replaced shell (StrictMode opens twice in dev)", async () => {
    await act(async () => {
      render(
        <StrictMode>
          <TerminalPanel />
        </StrictMode>,
      );
    });
    expect(channels).toHaveLength(2);

    act(() => {
      channels[0].onmessage({ event: "output", data: "stale" });
      channels[0].onmessage({ event: "exit" });
    });
    expect(mockTermWrite).not.toHaveBeenCalledWith("stale");
    expect(mockTermWrite).not.toHaveBeenCalledWith("\r\n[process exited]");
    expect(screen.queryByRole("button", { name: /restart/i })).toBeNull();

    act(() => {
      channels[1].onmessage({ event: "output", data: "live" });
    });
    expect(mockTermWrite).toHaveBeenCalledWith("live");
  });

  it("opens and closes one after another", async () => {
    const log: string[] = [];
    let finishFirst = () => {};
    vi.mocked(commands.terminalOpen)
      .mockImplementationOnce(() => {
        log.push("open 1");
        return new Promise((resolve) => {
          finishFirst = () => {
            log.push("open 1 done");
            resolve({ status: "ok", data: null });
          };
        });
      })
      .mockImplementationOnce(async () => {
        log.push("open 2");
        return { status: "ok", data: null };
      });
    vi.mocked(commands.terminalClose).mockImplementationOnce(async () => {
      log.push("close");
      return { status: "ok", data: null };
    });

    await act(async () => {
      render(
        <StrictMode>
          <TerminalPanel />
        </StrictMode>,
      );
    });
    expect(log).toEqual(["open 1"]);

    await act(async () => {
      finishFirst();
    });
    expect(log).toEqual(["open 1", "open 1 done", "close", "open 2"]);
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
