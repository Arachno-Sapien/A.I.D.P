import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    openFolder: vi.fn(),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    openRecent: vi.fn(),
    closeFolder: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    listDir: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

import { commands } from "../../lib/bindings";
import { useWorkspaceStore } from "./store";

describe("useWorkspaceStore", () => {
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

  it("openFolder keeps the state when cancelled", async () => {
    const existingInfo = {
      name: "existing",
      path: "/existing",
      isGit: true,
    };
    useWorkspaceStore.setState({ info: existingInfo });

    vi.mocked(commands.openFolder).mockResolvedValueOnce({
      status: "ok",
      data: null,
    });

    await useWorkspaceStore.getState().openFolder();

    expect(useWorkspaceStore.getState().info).toEqual(existingInfo);
  });

  it("toggleDir loads a folder once", async () => {
    useWorkspaceStore.setState({
      info: { name: "test", path: "/test", isGit: true },
      children: { "": [{ name: "src", path: "src", isDir: true }] },
    });

    vi.mocked(commands.listDir).mockResolvedValueOnce({
      status: "ok",
      data: [{ name: "a.ts", path: "src/a.ts", isDir: false }],
    });

    // First toggle: expands and loads
    await useWorkspaceStore.getState().toggleDir("src");
    expect(commands.listDir).toHaveBeenCalledTimes(1);
    expect(commands.listDir).toHaveBeenCalledWith("src");
    expect(useWorkspaceStore.getState().expanded["src"]).toBe(true);
    expect(useWorkspaceStore.getState().children["src"]).toEqual([
      { name: "a.ts", path: "src/a.ts", isDir: false },
    ]);

    // Second toggle: collapses without reloading
    await useWorkspaceStore.getState().toggleDir("src");
    expect(commands.listDir).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().expanded["src"]).toBeUndefined();

    // Third toggle: expands using cached children, no new listDir call
    await useWorkspaceStore.getState().toggleDir("src");
    expect(commands.listDir).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().expanded["src"]).toBe(true);
  });

  it("loads recent folders on loadRecent", async () => {
    vi.mocked(commands.recentFolders).mockResolvedValueOnce({
      status: "ok",
      data: ["/path/1", "/path/2"],
    });

    await useWorkspaceStore.getState().loadRecent();
    expect(useWorkspaceStore.getState().recent).toEqual(["/path/1", "/path/2"]);
  });

  it("openRecent loads the folder and root listing", async () => {
    vi.mocked(commands.openRecent).mockResolvedValueOnce({
      status: "ok",
      data: { name: "my-project", path: "/my-project", isGit: true },
    });
    vi.mocked(commands.listDir).mockResolvedValueOnce({
      status: "ok",
      data: [{ name: "package.json", path: "package.json", isDir: false }],
    });
    vi.mocked(commands.recentFolders).mockResolvedValueOnce({
      status: "ok",
      data: ["/my-project"],
    });

    await useWorkspaceStore.getState().openRecent("/my-project");

    expect(useWorkspaceStore.getState().info).toEqual({
      name: "my-project",
      path: "/my-project",
      isGit: true,
    });
    expect(useWorkspaceStore.getState().children[""]).toEqual([
      { name: "package.json", path: "package.json", isDir: false },
    ]);
  });

  it("closeFolder clears info, children, and expanded", async () => {
    useWorkspaceStore.setState({
      info: { name: "test", path: "/test", isGit: true },
      children: { "": [{ name: "a", path: "a", isDir: false }] },
      expanded: { src: true },
    });

    vi.mocked(commands.closeFolder).mockResolvedValueOnce({
      status: "ok",
      data: null,
    });

    await useWorkspaceStore.getState().closeFolder();

    const state = useWorkspaceStore.getState();
    expect(state.info).toBeNull();
    expect(state.children).toEqual({});
    expect(state.expanded).toEqual({});
  });

  it("refreshTree reloads root and all expanded folders", async () => {
    useWorkspaceStore.setState({
      info: { name: "test", path: "/test", isGit: true },
      expanded: { src: true, "src/components": true },
      children: {
        "": [{ name: "src", path: "src", isDir: true }],
        src: [{ name: "components", path: "src/components", isDir: true }],
      },
    });

    vi.mocked(commands.listDir).mockResolvedValue({
      status: "ok",
      data: [],
    });

    await useWorkspaceStore.getState().refreshTree();

    expect(commands.listDir).toHaveBeenCalledWith("");
    expect(commands.listDir).toHaveBeenCalledWith("src");
    expect(commands.listDir).toHaveBeenCalledWith("src/components");
  });
});
