// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/bindings", () => ({
  commands: {
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    watchClose: vi.fn().mockResolvedValue(undefined),
    watchDrops: vi.fn().mockResolvedValue(undefined),
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
    ollamaStatus: vi.fn().mockResolvedValue({
      status: "ok",
      data: { state: "stopped" },
    }),
    getSettings: vi.fn().mockResolvedValue({
      status: "ok",
      data: { theme: "dark", keepAlive: "ollamaDefault", checkUpdatesAtStart: false },
    }),
    appVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkUpdate: vi.fn().mockResolvedValue({ status: "ok", data: null }),
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
import { useChatStore } from "./features/chat/store";
import { useWorkspaceChatStore } from "./features/workspace/chatStore";

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

  it("a dropped file goes to the chat on screen only", async () => {
    let drop: ((v: unknown) => void) | undefined;
    vi.mocked(commands.watchDrops).mockImplementation((channel: any) => {
      drop = (v) => channel.onmessage(v);
      return Promise.resolve();
    });
    useChatStore.setState({ pending: [], attachNotice: null });
    useWorkspaceChatStore.setState({ pending: [], attachNotice: null });
    const notes = { id: "b".repeat(64), name: "notes.md", mime: "text/plain", size: 5, kind: "text" as const, warning: null };
    render(<App />);

    await act(async () => drop?.({ added: [notes], refused: [] }));
    expect(useChatStore.getState().pending.map((a) => a.name)).toEqual(["notes.md"]);

    fireEvent.click(screen.getByRole("button", { name: /^models$/i }));
    await act(async () => drop?.({ added: [{ ...notes, id: "c".repeat(64) }], refused: [] }));
    expect(useChatStore.getState().pending).toHaveLength(1);
    expect(useWorkspaceChatStore.getState().pending).toHaveLength(0);
  });

  it("the main surfaces carry the theme hooks", () => {
    const { container } = render(<App />);
    expect(container.firstElementChild?.classList.contains("app-shell")).toBe(true);
    expect(container.querySelector("header")?.classList.contains("app-surface")).toBe(true);
    expect(container.querySelector("aside")?.classList.contains("app-surface")).toBe(true);
    expect(screen.getByPlaceholderText(/type a message/i).closest(".app-inset")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send" }).classList.contains("app-accent")).toBe(true);
  });

  it("shows Settings in the nav", () => {
    render(<App />);

    const settingsNav = screen.getByRole("button", { name: "Settings" });
    expect(settingsNav).toBeDefined();

    fireEvent.click(settingsNav);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeDefined();
  });

  it("each screen button shows an icon and keeps its name", () => {
    render(<App />);
    const screens = [/^chat$/i, /^workspace$/i, /^models$/i, /^settings$/i];
    for (const name of screens) {
      const btn = screen.getByRole("button", { name });
      expect(btn.querySelector("svg")).not.toBeNull();
    }
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("checks for updates 10 s after start when the setting is %s", async (on, calls) => {
    vi.useFakeTimers();
    try {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { theme: "dark", keepAlive: "ollamaDefault", checkUpdatesAtStart: on },
      });
      vi.mocked(commands.checkUpdate).mockResolvedValue({ status: "ok", data: null });
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(commands.checkUpdate).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(commands.checkUpdate).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
