// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/bindings", () => ({
  commands: {
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

import App from "./App";
import { useModelsStore } from "./features/models/store";

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
});
