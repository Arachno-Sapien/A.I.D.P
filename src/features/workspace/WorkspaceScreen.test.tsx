// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    openFolder: vi.fn(),
    openRecent: vi.fn(),
    closeFolder: vi.fn(),
    listDir: vi.fn(),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./TerminalPanel", () => ({
  default: () => <div data-testid="terminal-panel">Terminal Panel</div>,
  TerminalPanel: () => <div data-testid="terminal-panel">Terminal Panel</div>,
}));

import { useWorkspaceChatStore } from "./chatStore";
import { useWorkspaceStore } from "./store";
import { WorkspaceScreen } from "./WorkspaceScreen";

describe("WorkspaceScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      info: null,
      recent: [],
      children: {},
      expanded: {},
      error: null,
    });
    useWorkspaceChatStore.setState({ messages: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the no-git banner when isGit is false", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: false },
    });

    const { rerender } = render(<WorkspaceScreen />);
    expect(
      screen.getByText(
        "This folder isn't a git repository. AI edits can't be undone easily.",
      ),
    ).toBeDefined();

    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });
    rerender(<WorkspaceScreen />);
    expect(
      screen.queryByText(
        "This folder isn't a git repository. AI edits can't be undone easily.",
      ),
    ).toBeNull();
  });

  it("offers to continue in the last folder", () => {
    const openRecentMock = vi.fn();
    useWorkspaceStore.setState({
      info: null,
      recent: ["C:\\code\\first", "/projects/second"],
      openRecent: openRecentMock,
    });

    render(<WorkspaceScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^Continue in first/ }));

    expect(openRecentMock).toHaveBeenCalledWith("C:\\code\\first");
  });

  it("lists the older folders under Recent folders", () => {
    const openRecentMock = vi.fn();
    useWorkspaceStore.setState({
      info: null,
      recent: ["/projects/first", "/projects/second"],
      openRecent: openRecentMock,
    });

    render(<WorkspaceScreen />);
    const list = screen.getByRole("list");
    expect(list.textContent).not.toContain("/projects/first");
    fireEvent.click(screen.getByRole("button", { name: "/projects/second" }));

    expect(openRecentMock).toHaveBeenCalledWith("/projects/second");
  });

  it("shows no Continue button before any folder was opened", () => {
    render(<WorkspaceScreen />);
    expect(screen.queryByRole("button", { name: /^Continue in/ })).toBeNull();
    expect(screen.queryByText("Recent folders")).toBeNull();
  });

  it("New file starts in the folder last clicked, and at the top in another workspace", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
      children: { "": [{ name: "src", path: "src", isDir: true }] },
      toggleDir: vi.fn(),
    });
    const { rerender } = render(<WorkspaceScreen />);
    const nameBox = () => screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(nameBox().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "New file" }));

    fireEvent.click(screen.getByText("src"));
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(nameBox().value).toBe("src/");
    fireEvent.click(screen.getByRole("button", { name: "New file" }));

    act(() => {
      useWorkspaceStore.setState({
        info: { name: "other", path: "/projects/other", isGit: true },
      });
    });
    rerender(<WorkspaceScreen />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(nameBox().value).toBe("");
  });

  describe("tree actions", () => {
    const show = (extra: Record<string, unknown> = {}) => {
      useWorkspaceStore.setState({
        info: { name: "my-app", path: "/projects/my-app", isGit: true },
        children: {
          "": [
            { name: "src", path: "src", isDir: true },
            { name: "a.ts", path: "a.ts", isDir: false },
          ],
        },
        toggleDir: vi.fn(),
        ...extra,
      });
      return render(<WorkspaceScreen />);
    };

    it("Delete from the menu asks first, then deletes", async () => {
      const remove = vi.fn().mockResolvedValue(null);
      show({ remove });
      fireEvent.contextMenu(screen.getByText("a.ts"), { clientX: 20, clientY: 30 });
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      const dialog = screen.getByRole("dialog", { name: "Delete a.ts?" });
      expect(remove).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: /^Move to/ }));
      });
      expect(remove).toHaveBeenCalledWith("a.ts");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Rename from the menu renames in place", async () => {
      const move = vi.fn().mockResolvedValue(null);
      show({ move });
      fireEvent.contextMenu(screen.getByText("a.ts"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
      const box = screen.getByRole("textbox", { name: "New name for a.ts" });
      fireEvent.change(box, { target: { value: "b.ts" } });
      await act(async () => {
        fireEvent.keyDown(box, { key: "Enter" });
      });
      expect(move).toHaveBeenCalledWith("a.ts", "b.ts");
    });

    it("New file from a folder's menu starts in that folder", () => {
      show();
      fireEvent.contextMenu(screen.getByText("src"));
      fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
      const box = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;
      expect(box.value).toBe("src/");
    });

    it("Delete on a file with unsaved changes says why at once, without asking", () => {
      const remove = vi.fn();
      show({
        remove,
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
      });
      const files = within(screen.getByTestId("files-panel"));
      const row = files.getByText("a.ts").closest("[data-tree-row]") as HTMLElement;
      fireEvent.keyDown(row, { key: "Delete" });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Save or close a.ts first: it has unsaved changes.")).toBeDefined();
      expect(remove).not.toHaveBeenCalled();
      useWorkspaceStore.setState({ tabs: [], active: null });
    });

    it("a refused rename shows why", async () => {
      const move = vi.fn().mockResolvedValue("Save or close a.ts first: it has unsaved changes.");
      show({ move });
      const row = screen.getByText("a.ts").closest("[data-tree-row]") as HTMLElement;
      fireEvent.keyDown(row, { key: "F2" });
      const box = screen.getByRole("textbox", { name: "New name for a.ts" });
      fireEvent.change(box, { target: { value: "b.ts" } });
      await act(async () => {
        fireEvent.keyDown(box, { key: "Enter" });
      });
      expect(screen.getByText("Save or close a.ts first: it has unsaved changes.")).toBeDefined();
    });
  });

  it("toggles the terminal panel", async () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });

    render(<WorkspaceScreen />);

    // Initially hidden
    expect(screen.queryByTestId("terminal-panel")).toBeNull();

    // Click Terminal button to toggle on
    const terminalBtn = screen.getByRole("button", { name: "Terminal" });
    fireEvent.click(terminalBtn);

    expect(await screen.findByTestId("terminal-panel")).toBeDefined();

    // Press Ctrl+\ to toggle off
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(screen.queryByTestId("terminal-panel")).toBeNull();

    // Press Ctrl+\ to toggle on
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(await screen.findByTestId("terminal-panel")).toBeDefined();
  });

  it("toggles the panels with the buttons and shortcuts", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });
    render(<WorkspaceScreen />);
    const files = screen.getByTestId("files-panel");
    const ai = screen.getByTestId("ai-panel");
    const filesBtn = screen.getByRole("button", { name: "Files" });
    const aiBtn = screen.getByRole("button", { name: "AI" });
    expect(files.hidden).toBe(false);
    expect(ai.hidden).toBe(false);
    expect(filesBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(filesBtn);
    expect(files.hidden).toBe(true);
    expect(filesBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(files.hidden).toBe(false);

    fireEvent.click(aiBtn);
    expect(ai.hidden).toBe(true);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, altKey: true });
    expect(ai.hidden).toBe(false);
    expect(files.hidden).toBe(false);
  });

  it("ignores the shortcuts on other screens", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });
    render(<WorkspaceScreen active={false} />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(screen.getByTestId("files-panel").hidden).toBe(false);
    expect(screen.queryByTestId("terminal-panel")).toBeNull();
  });

  it("opens the AI panel when a command waits for approval", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });
    render(<WorkspaceScreen />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByTestId("ai-panel").hidden).toBe(true);

    act(() => {
      useWorkspaceChatStore.setState({
        messages: [
          {
            id: "a1",
            role: "assistant",
            text: "",
            status: "streaming",
            parts: [
              {
                kind: "step",
                step: {
                  id: 1,
                  action: { tool: "runCommand", command: "npm test", folder: "." },
                  needsAnswer: true,
                },
              },
            ],
          },
        ],
      });
    });
    expect(screen.getByTestId("ai-panel").hidden).toBe(false);
  });

  it("bar buttons are icons with names and tooltips", () => {
    useWorkspaceStore.setState({
      info: { name: "my-app", path: "/projects/my-app", isGit: true },
    });
    render(<WorkspaceScreen />);
    const buttons = ["Files", "AI", "Terminal", "Refresh", "Close folder"];
    for (const name of buttons) {
      const btn = screen.getByRole("button", { name });
      expect(btn.querySelector("svg")).not.toBeNull();
      expect(btn.getAttribute("title")).toBeTruthy();
      expect(btn.textContent).toBe("");
    }
  });
});
