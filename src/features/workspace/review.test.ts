import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteEntry: vi.fn(),
    listDir: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
    answerTool: vi.fn().mockResolvedValue(true),
    closeFolder: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    recentFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    stopReply: vi.fn().mockResolvedValue(undefined),
  },
}));

import { commands } from "../../lib/bindings";
import type { ToolStep } from "../chat/store";
import { agentHooks } from "./agent";
import { useWorkspaceStore } from "./store";

const edit = (path: string, before: string, after: string, needsAnswer = false): ToolStep => ({
  id: 1,
  action: { tool: "editFile", path, before, after },
  needsAnswer,
  outcome: { status: "ok", summary: "written" },
});
const created = (path: string, text: string): ToolStep => ({
  id: 2,
  action: { tool: "createFile", path, text },
  needsAnswer: false,
  outcome: { status: "ok", summary: "created" },
});
const onDisk = (text: string) => ({
  status: "ok" as const,
  data: { path: "x", text, version: "v9", lineEnding: "crlf" as const, hasBom: true, isSecret: false },
});

describe("review at the end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ review: [], tabs: [], proposal: null, children: {}, error: null });
    vi.mocked(commands.writeFile).mockResolvedValue({ status: "ok", data: "v10" });
    vi.mocked(commands.deleteEntry).mockResolvedValue({ status: "ok", data: null });
  });

  it("edits written without asking join the review, one entry per file", () => {
    agentHooks.onToolResult!(edit("a.ts", "one\n", "two\n"));
    agentHooks.onToolResult!(edit("a.ts", "two\n", "three\n"));
    agentHooks.onToolResult!(created("new.ts", "hi\n"));
    expect(useWorkspaceStore.getState().review).toEqual([
      { path: "a.ts", original: "one\n", current: "three\n" },
      { path: "new.ts", original: null, current: "hi\n" },
    ]);
  });

  it("answered or failed edits stay out of the review", () => {
    agentHooks.onToolResult!(edit("a.ts", "one\n", "two\n", true));
    agentHooks.onToolResult!({ ...edit("b.ts", "", ""), outcome: { status: "error", message: "nope" } });
    expect(useWorkspaceStore.getState().review).toEqual([]);
  });

  it("Undo writes the original back over the agent's version", async () => {
    useWorkspaceStore.setState({ review: [{ path: "a.ts", original: "one\n", current: "three\n" }] });
    vi.mocked(commands.readFile).mockResolvedValue(onDisk("three\r\n"));

    expect(await useWorkspaceStore.getState().undoReview("a.ts")).toBeNull();

    expect(commands.writeFile).toHaveBeenCalledWith({
      path: "a.ts",
      text: "one\n",
      lineEnding: "crlf",
      hasBom: true,
      expectedVersion: "v9",
    });
    expect(useWorkspaceStore.getState().review).toEqual([]);
  });

  it("Undo of a new file sends it to the Recycle Bin", async () => {
    useWorkspaceStore.setState({ review: [{ path: "new.ts", original: null, current: "hi\n" }] });
    vi.mocked(commands.readFile).mockResolvedValue(onDisk("hi\n"));

    expect(await useWorkspaceStore.getState().undoReview("new.ts")).toBeNull();

    expect(commands.deleteEntry).toHaveBeenCalledWith("new.ts");
    expect(commands.writeFile).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().review).toEqual([]);
  });

  it("Undo leaves a file alone that changed after the agent wrote it", async () => {
    useWorkspaceStore.setState({ review: [{ path: "a.ts", original: "one\n", current: "three\n" }] });
    vi.mocked(commands.readFile).mockResolvedValue(onDisk("someone else\n"));

    expect(await useWorkspaceStore.getState().undoReview("a.ts")).toBe(
      "a.ts changed after the agent wrote it, so it was left as it is.",
    );
    expect(commands.writeFile).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().review).toHaveLength(1);
  });

  it("Undo waits for unsaved edits in an open tab", async () => {
    useWorkspaceStore.setState({
      review: [{ path: "a.ts", original: "one\n", current: "three\n" }],
      tabs: [{ path: "a.ts", name: "a.ts", version: "v1", lineEnding: "lf", hasBom: false, isSecret: false, dirty: true }],
    });

    expect(await useWorkspaceStore.getState().undoReview("a.ts")).toMatch(/unsaved changes/);
    expect(commands.readFile).not.toHaveBeenCalled();
  });

  it("Undo all undoes every file and reports what it couldn't", async () => {
    useWorkspaceStore.setState({
      review: [
        { path: "a.ts", original: "one\n", current: "three\n" },
        { path: "b.ts", original: "x\n", current: "y\n" },
      ],
    });
    vi.mocked(commands.readFile)
      .mockResolvedValueOnce(onDisk("three\n"))
      .mockResolvedValueOnce(onDisk("changed\n"));

    expect(await useWorkspaceStore.getState().undoAll()).toBe(
      "b.ts changed after the agent wrote it, so it was left as it is.",
    );
    expect(useWorkspaceStore.getState().review.map((f) => f.path)).toEqual(["b.ts"]);
  });

  it("Keep all ends the review and touches nothing", () => {
    useWorkspaceStore.setState({ review: [{ path: "a.ts", original: "one\n", current: "two\n" }] });
    useWorkspaceStore.getState().keepReview();
    expect(useWorkspaceStore.getState().review).toEqual([]);
    expect(commands.writeFile).not.toHaveBeenCalled();
  });

  it("closing the folder ends the review and turns the switch off", async () => {
    useWorkspaceStore.setState({
      reviewAtEnd: true,
      review: [{ path: "a.ts", original: "one\n", current: "two\n" }],
      reviewDiff: "a.ts",
    });
    await useWorkspaceStore.getState().forceCloseFolder();
    const s = useWorkspaceStore.getState();
    expect(s.review).toEqual([]);
    expect(s.reviewDiff).toBeNull();
    expect(s.reviewAtEnd).toBe(false);
  });
});
