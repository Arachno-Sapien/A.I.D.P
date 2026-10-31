// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Markdown } from "../chat/Markdown";
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
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createConversation: vi.fn().mockResolvedValue({
      status: "ok",
      data: { id: 1, title: "test", workspacePath: null, updatedAt: 100 },
    }),
    deleteConversation: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    loadMessages: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    appendMessage: vi.fn().mockResolvedValue({ status: "ok", data: 1 }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

// The real Markdown, counted, to see which messages render again.
vi.mock("../chat/Markdown", async (importOriginal) => {
  const real = await importOriginal<typeof import("../chat/Markdown")>();
  return { Markdown: vi.fn(real.Markdown) };
});

vi.mock("../models/store", () => {
  const fn = vi.fn();
  (fn as any).getState = () => fn();
  return { useModelsStore: fn };
});

afterEach(() => {
  cleanup();
});

describe("AiPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceChatStore.setState({
      messages: [],
      streaming: false,
      conversationId: null,
      place: "/workspace",
      conversations: [],
      saveError: null,
    });

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

    await vi.waitFor(() => {
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
    });

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

    await vi.waitFor(() => {
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

    await vi.waitFor(() => {
      const userMsg = vi
        .mocked(commands.sendMessage)
        .mock.calls[0]?.[3].find((m) => m.role === "user");
      expect(userMsg?.content).toContain("Selected lines 1-1 of src/a.ts:");
      expect(userMsg?.content).not.toContain("File src/a.ts:");
    });
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

    await vi.waitFor(() => {
      expect(commands.runAgent).toHaveBeenCalled();
    });
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

    await vi.waitFor(() => {
      expect(commands.sendMessage).toHaveBeenCalledWith(
        "workspace",
        1,
        "unknown-model",
        expect.arrayContaining([
          { role: "system", content: WORKSPACE_SYSTEM },
        ]),
        expect.anything(),
      );
    });

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

  it("caps attachments to the model's context", async () => {
    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "small-ctx-model",
          displayName: "Small Ctx Model",
          connectionLabel: "Provider",
          contextTokens: 8192,
        },
      ],
      selected: { connectionId: 1, modelId: "small-ctx-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    const longText = "a".repeat(50_000);
    buffers.open("src/a.ts", createState(longText, "a.ts"));

    render(<AiPanel />);

    expect(
      screen.getByText(/\(cut to fit the model's context\)/i),
    ).toBeDefined();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Review this file" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await vi.waitFor(() => {
      expect(commands.sendMessage).toHaveBeenCalled();
    });
    const msgs = vi.mocked(commands.sendMessage).mock.calls[0][3];
    const userMsg = msgs.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("a".repeat(16_384));
    expect(userMsg?.content).not.toContain("a".repeat(16_385));
  });

  it("keeps the Agent label whole", () => {
    const longModelName = "A".repeat(60);
    vi.mocked(useModelsStore).mockReturnValue({
      chatModels: [
        {
          connectionId: 1,
          modelId: "long-model",
          displayName: longModelName,
          connectionLabel: "Provider",
          supportsTools: true,
        },
      ],
      selected: { connectionId: 1, modelId: "long-model" },
      loaded: true,
      select: vi.fn(),
      load: vi.fn(),
    } as any);

    render(<AiPanel />);

    const agentCheckbox = screen.getByRole("checkbox", { name: "Agent" });
    const agentLabel = agentCheckbox.closest("label");
    expect(agentLabel?.className).toContain("shrink-0");

    const select = screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement;
    expect(select.className).toContain("min-w-0");
    expect(select.getAttribute("title")).toBe(longModelName);
  });

  it("Clear button asks confirmation and removes the conversation", async () => {
    useWorkspaceChatStore.setState({
      conversationId: 55,
      place: "/workspace",
      conversations: [
        { id: 55, title: "Chat", workspacePath: "/workspace", updatedAt: 100, pinned: false, archived: false },
      ],
      messages: [
        { id: "u1", role: "user", text: "hi", status: "complete" },
        { id: "a1", role: "assistant", text: "hello", status: "complete" },
      ],
    });

    render(<AiPanel />);

    const clearBtn = screen.getByRole("button", { name: /^clear$/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText(/clear this chat\?/i)).toBeDefined();

    // Cancel
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText(/clear this chat\?/i)).toBeNull();
    expect(commands.deleteConversation).not.toHaveBeenCalled();

    // Confirm
    const clearBtnAgain = screen.getByRole("button", { name: /^clear$/i });
    fireEvent.click(clearBtnAgain);
    const confirmBtn = screen.getByRole("button", { name: /^clear$/i });
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(commands.deleteConversation).toHaveBeenCalledWith(55);
      expect(useWorkspaceChatStore.getState().messages.length).toBe(0);
      expect(useWorkspaceChatStore.getState().conversationId).toBeNull();
    });
  });
});

describe("AiPanel while a reply streams", () => {
  it("hides Clear, which would delete the conversation mid-reply", () => {
    useWorkspaceChatStore.setState({
      messages: [{ id: "a", role: "user", text: "hi", status: "complete" }],
      streaming: true,
    });
    render(<AiPanel />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("a streamed chunk re-renders only the reply it belongs to", () => {
    useWorkspaceChatStore.setState({
      messages: [
        { id: "a1", role: "assistant", text: "an earlier reply", status: "complete" },
        { id: "a2", role: "assistant", text: "", status: "streaming" },
      ],
      streaming: true,
    });
    render(<AiPanel />);
    vi.mocked(Markdown).mockClear();

    act(() => {
      useWorkspaceChatStore.getState().applyEvent("a2", { event: "delta", data: "hi" });
    });
    expect(Markdown).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Markdown).mock.calls[0][0].text).toBe("hi");
  });
});
