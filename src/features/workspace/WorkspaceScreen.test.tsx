// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("opens a recent folder", () => {
    const openRecentMock = vi.fn();
    useWorkspaceStore.setState({
      info: null,
      recent: ["/projects/first", "/projects/second"],
      openRecent: openRecentMock,
    });

    render(<WorkspaceScreen />);
    const recentItem = screen.getByText("/projects/first");
    fireEvent.click(recentItem);

    expect(openRecentMock).toHaveBeenCalledWith("/projects/first");
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
});
