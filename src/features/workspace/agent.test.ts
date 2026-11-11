import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    readFile: vi.fn(),
    listDir: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    writeFile: vi.fn(),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
    answerTool: vi.fn().mockResolvedValue(true),
  },
}));

import { commands } from "../../lib/bindings";
import { agentHooks } from "./agent";
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

describe("agentHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buffers.clear();
    useWorkspaceStore.setState({
      tabs: [],
      active: null,
      proposal: null,
      children: {},
    });
  });

  it("accepted tool edit reloads a clean tab only", async () => {
    buffers.open("clean.ts", createState("original clean", "clean.ts"));
    buffers.open("dirty.ts", createState("original dirty", "dirty.ts"));

    useWorkspaceStore.setState({
      tabs: [tab("clean.ts", false), tab("dirty.ts", true)],
    });

    vi.mocked(commands.readFile).mockResolvedValue({
      status: "ok",
      data: {
        path: "clean.ts",
        text: "reloaded text",
        version: "v2",
        lineEnding: "lf",
        hasBom: false,
        isSecret: false,
      },
    });

    // An ok tool result for clean.ts
    agentHooks.onToolResult?.({
      id: 1,
      action: {
        tool: "editFile",
        path: "clean.ts",
        before: "original clean",
        after: "reloaded text",
      },
      needsAnswer: true,
      outcome: { status: "ok", summary: "applied" },
    });

    expect(commands.readFile).toHaveBeenCalledWith("clean.ts");

    // An ok tool result for dirty.ts
    vi.mocked(commands.readFile).mockClear();
    agentHooks.onToolResult?.({
      id: 2,
      action: {
        tool: "editFile",
        path: "dirty.ts",
        before: "original dirty",
        after: "new text",
      },
      needsAnswer: true,
      outcome: { status: "ok", summary: "applied" },
    });

    expect(commands.readFile).not.toHaveBeenCalled();
  });
});

describe("agentHooks servers", () => {
  it("a started server opens its terminal tab", () => {
    useWorkspaceStore.setState({ serverTab: null, serversVersion: 0 });
    agentHooks.onToolResult?.({
      id: 5,
      action: { tool: "startServer", command: "npm run dev", folder: "/p" },
      needsAnswer: false,
      outcome: { status: "server", server: 3, output: "ready" },
    });
    expect(useWorkspaceStore.getState().serverTab).toBe(3);
    expect(useWorkspaceStore.getState().serversVersion).toBe(1);
  });

  it("a stopped server refreshes the tabs", () => {
    useWorkspaceStore.setState({ serverTab: 3, serversVersion: 4 });
    agentHooks.onToolResult?.({
      id: 6,
      action: { tool: "stopServer", server: 3 },
      needsAnswer: false,
      outcome: { status: "ok", summary: "Stopped." },
    });
    expect(useWorkspaceStore.getState().serverTab).toBeNull();
    expect(useWorkspaceStore.getState().serversVersion).toBe(5);
  });
});

