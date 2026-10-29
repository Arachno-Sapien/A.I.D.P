// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    openFolder: vi.fn(),
    openRecent: vi.fn(),
    closeFolder: vi.fn(),
    listDir: vi.fn(),
  },
}));

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
});
