// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AiPanel } from "./AiPanel";
import { commands } from "../../lib/bindings";
import { useWorkspaceStore } from "./store";
import { useWorkspaceChatStore } from "./chatStore";
import { useModelsStore } from "../models/store";
import { buffers } from "./buffers";
import { createState } from "./cm";
import { WORKSPACE_SYSTEM } from "./context";

vi.mock("../../lib/bindings", () => ({
  commands: {
    sendMessage: vi.fn(),
    stopReply: vi.fn(),
    listChatModels: vi.fn(),
    runAgent: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    answerTool: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

vi.mock("../models/store", () => ({
  useModelsStore: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("AiPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceChatStore.getState().clear();

    vi.mocked(commands.sendMessage).mockResolvedValue({
      status: "ok",
      data: null,
    });
    vi.mocked(commands.stopReply).mockResolvedValue(undefined as any);

    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "test-model",
          displayName: "Test Model",
          connectionLabel: "Test Provider",
        },
      ],
      selected: { connectionId: 1, modelId: "test-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    useWorkspaceStore.setState({
      active: "src/a.ts",
      selection: null,
      tabs: [
        {
          path: "src/a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: false,
        },
      ],
    });

    buffers.set(
      "src/a.ts",
      createState("function hello() {\n  return 42;\n}", "a.ts"),
    );
  });

  it("sends on the workspace surface with context", async () => {
    render(<AiPanel />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Explain this function" } });

    const sendBtn = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendBtn);

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "workspace",
      1,
      "test-model",
      expect.arrayContaining([
        { role: "system", content: WORKSPACE_SYSTEM },
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("File src/a.ts:"),
        }),
      ]),
      expect.anything(),
    );

    const callArgs = vi.mocked(commands.sendMessage).mock.calls[0];
    const userMsg = callArgs[3].find((m) => m.role === "user");
    expect(userMsg?.content).toContain("function hello()");
    expect(userMsg?.content).toContain("Explain this function");
  });

  it("a removed chip is not sent", async () => {
    render(<AiPanel />);

    const removeBtn = screen.getByRole("button", { name: /remove a\.ts/i });
    fireEvent.click(removeBtn);

    expect(screen.getByRole("button", { name: /add a\.ts/i })).toBeDefined();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello without file" } });

    const sendBtn = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendBtn);

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "workspace",
      1,
      "test-model",
      [
        { role: "system", content: WORKSPACE_SYSTEM },
        { role: "user", content: "Hello without file" },
      ],
      expect.anything(),
    );
  });

  it("a selection can be sent from a file too large to attach", async () => {
    buffers.open("src/a.ts", createState("x".repeat(100_001), "a.ts"));
    useWorkspaceStore.setState({
      selection: {
        path: "src/a.ts",
        info: { text: "xx", fromLine: 1, toLine: 1 },
      },
    });

    render(<AiPanel />);
    expect(screen.getByText("a.ts:1-1")).toBeDefined();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "What is this?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    const userMsg = vi
      .mocked(commands.sendMessage)
      .mock.calls[0]?.[3].find((m) => m.role === "user");
    expect(userMsg?.content).toContain("Selected lines 1-1 of src/a.ts:");
    expect(userMsg?.content).not.toContain("File src/a.ts:");
  });

  it("Stop stops only the workspace reply", async () => {
    useWorkspaceChatStore.setState({ streaming: true });

    render(<AiPanel />);

    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stopBtn);

    expect(commands.stopReply).toHaveBeenCalledWith("workspace");
  });

  it("agent switch follows the model", async () => {
    // 1. Model with supportsTools: true -> agent switch is checked
    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "tool-model",
          displayName: "Tool Model",
          connectionLabel: "Provider",
          supportsTools: true,
        },
      ],
      selected: { connectionId: 1, modelId: "tool-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    render(<AiPanel />);
    const agentCheckbox = screen.getByRole("checkbox", { name: /agent/i });
    expect((agentCheckbox as HTMLInputElement).checked).toBe(true);
    expect((agentCheckbox as HTMLInputElement).disabled).toBe(false);

    // Sending with agent ON calls runAgent and no system message
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Run agent task" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(commands.runAgent).toHaveBeenCalled();
    const runAgentMsgs = vi.mocked(commands.runAgent).mock.calls[0][2];
    expect(runAgentMsgs.some((m) => m.role === "system")).toBe(false);
    expect(commands.sendMessage).not.toHaveBeenCalled();

    // 2. Model with supportsTools: null -> agent switch is off (unchecked)
    cleanup();
    useWorkspaceChatStore.getState().clear();
    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "unknown-model",
          displayName: "Unknown Model",
          connectionLabel: "Provider",
          supportsTools: null,
        },
      ],
      selected: { connectionId: 1, modelId: "unknown-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    render(<AiPanel />);
    const unknownCheckbox = screen.getByRole("checkbox", { name: /agent/i });
    expect((unknownCheckbox as HTMLInputElement).checked).toBe(false);
    expect((unknownCheckbox as HTMLInputElement).disabled).toBe(false);

    // When off, sending calls sendMessage with WORKSPACE_SYSTEM
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Standard question" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "workspace",
      1,
      "unknown-model",
      expect.arrayContaining([
        { role: "system", content: WORKSPACE_SYSTEM },
      ]),
      expect.anything(),
    );

    // 3. Model with supportsTools: false -> agent switch is disabled with title
    cleanup();
    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "no-tool-model",
          displayName: "No Tool Model",
          connectionLabel: "Provider",
          supportsTools: false,
        },
      ],
      selected: { connectionId: 1, modelId: "no-tool-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    render(<AiPanel />);
    const disabledCheckbox = screen.getByRole("checkbox", { name: /agent/i });
    expect((disabledCheckbox as HTMLInputElement).checked).toBe(false);
    expect((disabledCheckbox as HTMLInputElement).disabled).toBe(true);
    expect(
      disabledCheckbox.getAttribute("title") ||
        disabledCheckbox.parentElement?.getAttribute("title"),
    ).toBe("This model can't use tools");
  });
});
