// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    appVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkUpdate: vi.fn(),
    installUpdate: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands, type UpdateEvent } from "../../lib/bindings";
import { UpdateBar } from "./UpdateBar";
import { useUpdatesStore } from "./updates";

describe("UpdateBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdatesStore.setState({
      found: null,
      dismissed: false,
      checking: false,
      upToDate: false,
      stage: null,
      progress: null,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the bar and installs on click", () => {
    let channel: { onmessage: (ev: UpdateEvent) => void } | undefined;
    vi.mocked(commands.installUpdate).mockImplementation((ch) => {
      channel = ch as unknown as typeof channel;
      return new Promise(() => {});
    });
    useUpdatesStore.setState({ found: { version: "0.1.1", notes: null } });
    render(<UpdateBar />);
    expect(screen.getByText("A.I.D.P 0.1.1 is available.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    expect(commands.installUpdate).toHaveBeenCalledOnce();
    act(() => {
      channel?.onmessage({ event: "progress", data: { downloadedKb: 512, totalKb: 1024 } });
    });
    expect(screen.getByText("Downloading… 50%")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Install and restart" })).toBeNull();

    act(() => {
      channel?.onmessage({ event: "installing" });
    });
    expect(screen.getByText("Installing…")).toBeDefined();
  });

  it("hides when Later is clicked", () => {
    useUpdatesStore.setState({ found: { version: "0.1.1", notes: null } });
    render(<UpdateBar />);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText("A.I.D.P 0.1.1 is available.")).toBeNull();
  });

  it("shows why an install failed", async () => {
    vi.mocked(commands.installUpdate).mockResolvedValue({
      status: "error",
      error: { kind: "invalidInput", message: "Save or close your unsaved files first." },
    });
    useUpdatesStore.setState({ found: { version: "0.1.1", notes: null } });
    render(<UpdateBar />);
    fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    expect(await screen.findByText("Save or close your unsaved files first.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeDefined();
  });

  it("a quiet check that fails shows nothing", async () => {
    vi.mocked(commands.checkUpdate).mockResolvedValue({
      status: "error",
      error: { kind: "update", message: "Couldn't check for updates: offline" },
    });
    await useUpdatesStore.getState().check(true);
    expect(useUpdatesStore.getState().error).toBeNull();
    expect(useUpdatesStore.getState().upToDate).toBe(false);
  });
});
