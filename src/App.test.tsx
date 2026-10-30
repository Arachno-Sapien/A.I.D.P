// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/bindings", () => ({
  commands: {
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    watchClose: vi.fn().mockResolvedValue(undefined),
    quitApp: vi.fn().mockResolvedValue(undefined),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    loadMessages: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createConversation: vi.fn().mockResolvedValue({
      status: "ok",
      data: { id: 1, title: "test", workspacePath: null, updatedAt: 100 },
    }),
    deleteConversation: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    appendMessage: vi.fn().mockResolvedValue({ status: "ok", data: 1 }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import App from "./App";
import { commands } from "./lib/bindings";
import { useModelsStore } from "./features/models/store";
import { useWorkspaceStore } from "./features/workspace/store";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
      loadError: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the workspace mounted", () => {
    render(<App />);

    // Initially on chat screen, workspace not mounted yet
    expect(screen.queryByTestId("workspace-container")).toBeNull();

    // Click Workspace nav
    const workspaceNav = screen.getByRole("button", { name: "Workspace" });
    fireEvent.click(workspaceNav);

    // Workspace container is mounted
    const wsNode = screen.getByTestId("workspace-container");
    expect(wsNode).toBeDefined();
    expect(wsNode.classList.contains("hidden")).toBe(false);

    // Click Chat nav
    const chatNav = screen.getByRole("button", { name: "Chat" });
    fireEvent.click(chatNav);

    // Workspace container is still in the DOM, but hidden
    expect(screen.getByTestId("workspace-container")).toBe(wsNode);
    expect(wsNode.classList.contains("hidden")).toBe(true);

    // Click Workspace nav again
    fireEvent.click(workspaceNav);
    expect(screen.getByTestId("workspace-container")).toBe(wsNode);
    expect(wsNode.classList.contains("hidden")).toBe(false);
  });

  it("quit prompt offers save, discard, cancel", async () => {
    let closeCallback: ((val: boolean) => void) | undefined;
    vi.mocked(commands.watchClose).mockImplementation((channel: any) => {
      closeCallback = channel.onmessage;
      return Promise.resolve();
    });

    const saveSpy = vi.fn(async (path: string) => {
      useWorkspaceStore.setState((s) => ({
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: false } : t)),
      }));
    });
    useWorkspaceStore.setState({
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: true,
        },
        {
          path: "b.ts",
          name: "b.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: true,
        },
      ],
      save: saveSpy,
    });

    render(<App />);

    // Trigger close notification from Rust
    act(() => {
      closeCallback?.(true);
    });

    // Prompt appears
    expect(
      screen.getByText(/You have unsaved changes in 2 files\./i),
    ).toBeDefined();

    // Cancel does neither quitApp nor save
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);
    expect(
      screen.queryByText(/You have unsaved changes in 2 files\./i),
    ).toBeNull();
    expect(commands.quitApp).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();

    // Trigger close again
    act(() => {
      closeCallback?.(true);
    });

    // Discard calls quitApp
    const discardBtn = screen.getByRole("button", {
      name: /discard and quit/i,
    });
    fireEvent.click(discardBtn);
    expect(commands.quitApp).toHaveBeenCalledTimes(1);

    vi.mocked(commands.quitApp).mockClear();

    // Trigger close again
    act(() => {
      closeCallback?.(true);
    });

    // Save all saves then quits
    const saveAllBtn = screen.getByRole("button", { name: /save all/i });
    fireEvent.click(saveAllBtn);
    await vi.waitFor(() => {
      expect(commands.quitApp).toHaveBeenCalledTimes(1);
    });
    expect(saveSpy).toHaveBeenCalledWith("a.ts");
    expect(saveSpy).toHaveBeenCalledWith("b.ts");
  });

  it("Save all does not quit when a file could not be saved", async () => {
    let closeCallback: ((val: boolean) => void) | undefined;
    vi.mocked(commands.watchClose).mockImplementation((channel: any) => {
      closeCallback = channel.onmessage;
      return Promise.resolve();
    });

    // A save that fails (for example, the file changed on disk) leaves the tab dirty.
    const failingSave = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: true,
        },
      ],
      save: failingSave,
    });

    render(<App />);
    act(() => {
      closeCallback?.(true);
    });
    fireEvent.click(screen.getByRole("button", { name: /save all/i }));

    await vi.waitFor(() => {
      expect(failingSave).toHaveBeenCalledWith("a.ts");
    });
    await vi.waitFor(() => {
      expect(
        screen.queryByText(/You have unsaved changes in 1 file\./i),
      ).toBeNull();
    });
    expect(commands.quitApp).not.toHaveBeenCalled();
  });
});
