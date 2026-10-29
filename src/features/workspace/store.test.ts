import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    openFolder: vi.fn(),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    openRecent: vi.fn(),
    closeFolder: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    listDir: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
  },
}));

import { commands } from "../../lib/bindings";
import { buffers } from "./buffers";
import { createState } from "./cm";
import { useWorkspaceStore } from "./store";

const tab = (path: string, dirty: boolean) => ({
  path,
  name: path.split("/").pop() ?? path,
  version: "v1",
  lineEnding: "lf" as const,
  hasBom: false,
  isSecret: false,
  dirty,
});

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      info: null,
      recent: [],
      children: {},
      expanded: {},
      error: null,
      tabs: [],
      active: null,
      conflict: null,
      proposal: null,
      gitWarned: false,
      needsGitConfirm: false,
      dirtyPrompt: null,
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

  it("openFile activates an already-open tab without re-reading", async () => {
    vi.mocked(commands.readFile).mockResolvedValue({
      status: "ok",
      data: {
        path: "a.ts",
        text: "hello",
        version: "v1",
        lineEnding: "lf",
        hasBom: false,
        isSecret: false,
      },
    });

    await useWorkspaceStore.getState().openFile("a.ts");
    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().active).toBe("a.ts");

    await useWorkspaceStore.getState().openFile("a.ts");
    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().active).toBe("a.ts");
  });

  it("save sends expectedVersion, clears dirty on success", async () => {
    vi.mocked(commands.readFile).mockResolvedValueOnce({
      status: "ok",
      data: {
        path: "a.ts",
        text: "hello",
        version: "v1",
        lineEnding: "lf",
        hasBom: false,
        isSecret: false,
      },
    });
    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "ok",
      data: "v2",
    });

    await useWorkspaceStore.getState().openFile("a.ts");
    useWorkspaceStore.getState().setDirty("a.ts", true);
    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(true);

    await useWorkspaceStore.getState().save("a.ts");

    expect(commands.writeFile).toHaveBeenCalledWith({
      path: "a.ts",
      text: "hello",
      lineEnding: "lf",
      hasBom: false,
      expectedVersion: "v1",
    });

    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(false);
    expect(useWorkspaceStore.getState().tabs[0]?.version).toBe("v2");
  });

  it("save with ChangedOnDisk sets the conflict bar, keeps dirty", async () => {
    vi.mocked(commands.readFile).mockResolvedValueOnce({
      status: "ok",
      data: {
        path: "a.ts",
        text: "hello",
        version: "v1",
        lineEnding: "lf",
        hasBom: false,
        isSecret: false,
      },
    });
    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "error",
      error: { kind: "changedOnDisk" },
    });

    await useWorkspaceStore.getState().openFile("a.ts");
    useWorkspaceStore.getState().setDirty("a.ts", true);

    await useWorkspaceStore.getState().save("a.ts");

    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(true);
    expect(useWorkspaceStore.getState().conflict).toEqual({
      path: "a.ts",
      kind: "changedOnDisk",
    });
  });

  it("reload drops dirty changes, re-reads the file, clears conflict", async () => {
    vi.mocked(commands.readFile)
      .mockResolvedValueOnce({
        status: "ok",
        data: {
          path: "a.ts",
          text: "original content",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
        },
      })
      .mockResolvedValueOnce({
        status: "ok",
        data: {
          path: "a.ts",
          text: "updated content",
          version: "v2",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
        },
      });

    await useWorkspaceStore.getState().openFile("a.ts");
    useWorkspaceStore.getState().setDirty("a.ts", true);
    useWorkspaceStore.setState({
      conflict: { path: "a.ts", kind: "changedOnDisk" },
    });

    await useWorkspaceStore.getState().reload("a.ts");

    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(false);
    expect(useWorkspaceStore.getState().tabs[0]?.version).toBe("v2");
    expect(useWorkspaceStore.getState().conflict).toBeNull();
  });

  it("reject never writes", () => {
    useWorkspaceStore.setState({
      proposal: { path: "a.ts", original: "orig", proposed: "prop" },
    });

    useWorkspaceStore.getState().rejectProposal();

    expect(useWorkspaceStore.getState().proposal).toBeNull();
    expect(commands.writeFile).not.toHaveBeenCalled();
  });

  it("accept writes exactly the proposed text", async () => {
    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "ok",
      data: "v2",
    });

    useWorkspaceStore.setState({
      info: { name: "repo", path: "/repo", isGit: true },
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: false,
        },
      ],
      proposal: { path: "a.ts", original: "hello", proposed: "hello world" },
    });

    await useWorkspaceStore.getState().acceptProposal();

    expect(commands.writeFile).toHaveBeenCalledWith({
      path: "a.ts",
      text: "hello world",
      lineEnding: "lf",
      hasBom: false,
      expectedVersion: "v1",
    });

    expect(buffers.text("a.ts")).toBe("hello world");
    const tab = useWorkspaceStore.getState().tabs[0];
    expect(tab?.version).toBe("v2");
    expect(tab?.dirty).toBe(false);
    expect(useWorkspaceStore.getState().proposal).toBeNull();
  });

  it("asks once in a folder without git", async () => {
    vi.mocked(commands.writeFile).mockResolvedValue({
      status: "ok",
      data: "v2",
    });

    useWorkspaceStore.setState({
      info: { name: "no-git", path: "/no-git", isGit: false },
      gitWarned: false,
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: false,
        },
      ],
      proposal: { path: "a.ts", original: "hello", proposed: "hello world" },
    });

    await useWorkspaceStore.getState().acceptProposal();

    expect(commands.writeFile).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().needsGitConfirm).toBe(true);

    await useWorkspaceStore.getState().confirmGit();

    expect(commands.writeFile).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().gitWarned).toBe(true);
    expect(useWorkspaceStore.getState().needsGitConfirm).toBe(false);

    useWorkspaceStore.setState({
      proposal: { path: "a.ts", original: "hello world", proposed: "done" },
    });

    await useWorkspaceStore.getState().acceptProposal();
    expect(commands.writeFile).toHaveBeenCalledTimes(2);
  });

  it("refuses to apply to a file with unsaved edits", async () => {
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
    });

    await useWorkspaceStore
      .getState()
      .propose({ path: "a.ts", selection: null }, "new code");

    expect(useWorkspaceStore.getState().proposal).toBeNull();
    expect(useWorkspaceStore.getState().error).toContain("a.ts");
  });

  it("a conflict at accept keeps the proposal", async () => {
    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "error",
      error: { kind: "changedOnDisk" },
    });

    useWorkspaceStore.setState({
      info: { name: "repo", path: "/repo", isGit: true },
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: false,
        },
      ],
      proposal: { path: "a.ts", original: "hello", proposed: "hello world" },
    });

    await useWorkspaceStore.getState().acceptProposal();

    expect(useWorkspaceStore.getState().proposal).toEqual({
      path: "a.ts",
      original: "hello",
      proposed: "hello world",
    });
    expect(useWorkspaceStore.getState().conflict).toEqual({
      path: "a.ts",
      kind: "changedOnDisk",
    });
  });

  it("reports unsaved state to Rust", async () => {
    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "ok",
      data: "v2",
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
          dirty: false,
        },
      ],
    });

    buffers.open("a.ts", createState("x", "a.ts"));
    useWorkspaceStore.getState().setDirty("a.ts", true);
    expect(commands.setUnsaved).toHaveBeenCalledWith(true);

    vi.mocked(commands.setUnsaved).mockClear();

    await useWorkspaceStore.getState().save("a.ts");
    expect(commands.setUnsaved).toHaveBeenCalledWith(false);
  });

  it("switching folders with unsaved tabs asks first", async () => {
    vi.mocked(commands.openFolder).mockResolvedValueOnce({
      status: "ok",
      data: null,
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
      ],
    });

    await useWorkspaceStore.getState().openFolder();
    expect(commands.openFolder).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().dirtyPrompt).toBe("open");

    await useWorkspaceStore.getState().discardAndProceed();
    expect(commands.openFolder).toHaveBeenCalled();
    expect(useWorkspaceStore.getState().dirtyPrompt).toBeNull();
  });

  it("keys a tab by the path that was asked for", async () => {
    vi.mocked(commands.readFile).mockResolvedValueOnce({
      status: "ok",
      data: {
        path: "src/a.ts",
        text: "x",
        version: "v1",
        lineEnding: "lf",
        hasBom: false,
        isSecret: false,
      },
    });

    await useWorkspaceStore.getState().openFile("inner/a.ts");

    expect(useWorkspaceStore.getState().tabs[0]?.path).toBe("inner/a.ts");
    expect(buffers.text("inner/a.ts")).toBe("x");
  });

  it("save never writes a tab whose text is missing", async () => {
    useWorkspaceStore.setState({ tabs: [tab("gone.ts", true)], active: "gone.ts" });
    buffers.remove("gone.ts");

    await useWorkspaceStore.getState().save("gone.ts");

    expect(commands.writeFile).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().error).toMatch(/gone\.ts/);
  });

  it("saveAll reports whether everything was saved", async () => {
    buffers.open("a.ts", createState("x", "a.ts"));
    useWorkspaceStore.setState({ tabs: [tab("a.ts", true)] });

    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "error",
      error: { kind: "changedOnDisk" },
    });
    expect(await useWorkspaceStore.getState().saveAll()).toBe(false);

    vi.mocked(commands.writeFile).mockResolvedValueOnce({
      status: "ok",
      data: "v2",
    });
    expect(await useWorkspaceStore.getState().saveAll()).toBe(true);
  });

  it("opening another folder drops the old folder's buffers", async () => {
    buffers.open("a.ts", createState("old", "a.ts"));
    vi.mocked(commands.openFolder).mockResolvedValueOnce({
      status: "ok",
      data: { name: "b", path: "/b", isGit: true },
    });

    await useWorkspaceStore.getState().openFolder();

    expect(buffers.get("a.ts")).toBeUndefined();
  });
});

