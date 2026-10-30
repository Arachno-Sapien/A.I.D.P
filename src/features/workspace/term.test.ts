// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

const mockOnData = vi.fn();
const mockOpen = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockFit = vi.fn();
let capturedOptions: any = null;
let dataHandler: ((data: string) => void) | null = null;
let mockCols = 80;
let mockRows = 24;

vi.mock("@xterm/xterm", () => {
  return {
    Terminal: class {
      options: any;
      constructor(options: any) {
        this.options = options;
        capturedOptions = options;
      }
      open = mockOpen;
      dispose = mockDispose;
      loadAddon = mockLoadAddon;
      onData = (cb: (data: string) => void) => {
        dataHandler = cb;
        mockOnData(cb);
      };
      get cols() {
        return mockCols;
      }
      get rows() {
        return mockRows;
      }
    },
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: class {
      fit = mockFit;
    },
  };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { mountTerminal } from "./term";

describe("mountTerminal", () => {
  it("mounts with xterm, dark theme and monospace", () => {
    const el = document.createElement("div");
    const onInput = vi.fn();
    const onResize = vi.fn();

    const term = mountTerminal(el, { onInput, onResize });
    expect(term).toBeDefined();

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.fontFamily).toMatch(/monospace/i);
    expect(capturedOptions.fontSize).toBe(12);
    expect(capturedOptions.scrollback).toBe(1000);
    expect(capturedOptions.theme?.background).toMatch(/#0[0-9a-f]/i);
    expect(mockOpen).toHaveBeenCalledWith(el);
    expect(mockLoadAddon).toHaveBeenCalled();
  });

  it("onInput forwards typed data", () => {
    const el = document.createElement("div");
    const onInput = vi.fn();
    const onResize = vi.fn();

    mountTerminal(el, { onInput, onResize });

    expect(dataHandler).not.toBeNull();
    dataHandler?.("hello world");

    expect(onInput).toHaveBeenCalledWith("hello world");
  });

  it("fit notifies resize", () => {
    const el = document.createElement("div");
    const onInput = vi.fn();
    const onResize = vi.fn();

    const term = mountTerminal(el, { onInput, onResize });
    expect(term).toBeDefined();

    mockCols = 120;
    mockRows = 40;
    term.fit();

    expect(mockFit).toHaveBeenCalled();
    expect(onResize).toHaveBeenCalledWith(120, 40);
  });

  it("terminal follows the theme", () => {
    const el = document.createElement("div");
    const term = mountTerminal(el, { onInput: vi.fn(), onResize: vi.fn() });

    term.setTheme("light");
    expect(capturedOptions.theme.background).toBe("#fafafa");

    term.setTheme("dark");
    expect(capturedOptions.theme.background).toBe("#0a0a0a");
  });
});
