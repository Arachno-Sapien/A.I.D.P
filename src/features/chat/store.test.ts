import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    sendMessage: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    runAgent: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    answerTool: vi.fn().mockResolvedValue(true),
    stopReply: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createConversation: vi.fn().mockResolvedValue({
      status: "ok",
      data: { id: 1, title: "test", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
    }),
    deleteConversation: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    loadMessages: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    appendMessage: vi.fn().mockResolvedValue({ status: "ok", data: 1 }),
    setConversationPinned: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setConversationArchived: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { createChatStore, useChatStore } from "./store";

describe("useChatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      messages: [],
      streaming: false,
      conversationId: null,
      place: null,
      conversations: [],
      saveError: null,
    });
  });

  it("appends delta text", () => {
    useChatStore.setState({
      messages: [
        { id: "1", role: "assistant", text: "", status: "streaming" },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", { event: "delta", data: "Hel" });
    useChatStore.getState().applyEvent("1", { event: "delta", data: "lo" });

    const msgs = useChatStore.getState().messages;
    expect(msgs[0]?.text).toBe("Hello");
  });

  it("marks done replies complete", () => {
    useChatStore.setState({
      messages: [
        { id: "1", role: "assistant", text: "Hello", status: "streaming" },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", {
      event: "done",
      data: { tokensIn: 5, tokensOut: 2 },
    });

    const state = useChatStore.getState();
    expect(state.messages[0]?.status).toBe("complete");
    expect(state.streaming).toBe(false);
  });

  it("marks cancelled replies stopped", () => {
    useChatStore.setState({
      messages: [
        { id: "1", role: "assistant", text: "Part", status: "streaming" },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", {
      event: "error",
      data: { kind: "cancelled" },
    });

    const state = useChatStore.getState();
    expect(state.messages[0]?.status).toBe("stopped");
    expect(state.streaming).toBe(false);
  });

  it("marks failed replies error and keeps the kind", () => {
    useChatStore.setState({
      messages: [
        { id: "1", role: "assistant", text: "", status: "streaming" },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", {
      event: "error",
      data: { kind: "offline" },
    });

    const state = useChatStore.getState();
    expect(state.messages[0]?.status).toBe("error");
    expect(state.messages[0]?.error).toEqual({ kind: "offline" });
    expect(state.streaming).toBe(false);
  });

  it("ignores send while a reply is streaming", async () => {
    useChatStore.setState({ streaming: true });
    await useChatStore.getState().send("x", { connectionId: 1, modelId: "m1" });
    expect(commands.sendMessage).not.toHaveBeenCalled();
  });

  it("sends history without failed replies", async () => {
    useChatStore.setState({
      messages: [
        { id: "m1", role: "user", text: "a", status: "complete" },
        {
          id: "m2",
          role: "assistant",
          text: "b",
          status: "error",
          error: { kind: "offline" },
        },
        { id: "m3", role: "user", text: "c", status: "complete" },
        { id: "m4", role: "assistant", text: "partial", status: "stopped" },
      ],
      streaming: false,
    });

    await useChatStore.getState().send("d", { connectionId: 1, modelId: "m1" });

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "chat",
      1,
      "m1",
      [
        { role: "user", content: "a" },
        { role: "user", content: "c" },
        { role: "assistant", content: "partial" },
        { role: "user", content: "d" },
      ],
      expect.anything(),
    );
  });

  it("leaves empty replies out of the history", async () => {
    useChatStore.setState({
      messages: [
        { id: "m1", role: "user", text: "a", status: "complete" },
        { id: "m2", role: "assistant", text: "", status: "stopped" },
      ],
      streaming: false,
    });

    await useChatStore.getState().send("b", { connectionId: 1, modelId: "m1" });

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "chat",
      1,
      "m1",
      [
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
      expect.anything(),
    );
  });

  it("shows a command error on the reply", async () => {
    vi.mocked(commands.sendMessage).mockResolvedValueOnce({
      status: "error",
      error: { kind: "keyMissing" },
    });

    await useChatStore.getState().send("hi", { connectionId: 1, modelId: "m1" });

    const state = useChatStore.getState();
    expect(state.streaming).toBe(false);
    expect(state.messages.length).toBe(2);
    const assistant = state.messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.status).toBe("error");
    expect(assistant.commandError).toEqual({ kind: "keyMissing" });
  });

  it("sends content and a system message, shows the text", async () => {
    await useChatStore
      .getState()
      .send(
        "q",
        { connectionId: 1, modelId: "m1" },
        { content: "FULL", system: "SYS", chips: ["a.ts"] },
      );

    expect(commands.sendMessage).toHaveBeenCalledWith(
      "chat",
      1,
      "m1",
      [
        { role: "system", content: "SYS" },
        { role: "user", content: "FULL" },
      ],
      expect.anything(),
    );

    const msgs = useChatStore.getState().messages;
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.text).toBe("q");
    expect(msgs[0]?.chips).toEqual(["a.ts"]);
    expect(msgs[0]?.content).toBe("FULL");
  });

  it("two stores stream independently", async () => {
    const useWsChatStore = createChatStore("workspace");
    useChatStore.setState({ streaming: true });

    expect(useWsChatStore.getState().streaming).toBe(false);

    await useWsChatStore.getState().stop();
    expect(commands.stopReply).toHaveBeenCalledWith("workspace");
  });

  it("agent send calls runAgent", async () => {
    await useChatStore.getState().send(
      "agent task",
      { connectionId: 1, modelId: "m1" },
      { agent: true, system: "SHOULD NOT BE ADDED" },
    );

    expect(commands.runAgent).toHaveBeenCalledWith(
      1,
      "m1",
      [{ role: "user", content: "agent task" }],
      expect.anything(),
    );
    expect(commands.sendMessage).not.toHaveBeenCalled();

    const state = useChatStore.getState();
    const assistant = state.messages[1];
    expect(assistant.parts).toEqual([]);
  });

  it("tool events build parts in order", () => {
    useChatStore.setState({
      messages: [
        {
          id: "1",
          role: "assistant",
          text: "",
          parts: [],
          status: "streaming",
        },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", { event: "delta", data: "First text. " });
    useChatStore.getState().applyEvent("1", {
      event: "toolCall",
      data: {
        id: 42,
        action: { tool: "readFile", path: "src/main.rs" },
        needsAnswer: false,
      },
    });
    useChatStore.getState().applyEvent("1", {
      event: "toolResult",
      data: {
        id: 42,
        outcome: { status: "ok", summary: "read 10 lines" },
      },
    });
    useChatStore.getState().applyEvent("1", { event: "delta", data: "Second text." });

    const msg = useChatStore.getState().messages[0];
    expect(msg.text).toBe("First text. Second text.");
    expect(msg.parts).toEqual([
      { kind: "text", text: "First text. " },
      {
        kind: "step",
        step: {
          id: 42,
          action: { tool: "readFile", path: "src/main.rs" },
          needsAnswer: false,
          outcome: { status: "ok", summary: "read 10 lines" },
        },
      },
      { kind: "text", text: "Second text." },
    ]);
  });

  it("unfinished steps end stopped", () => {
    useChatStore.setState({
      messages: [
        {
          id: "1",
          role: "assistant",
          text: "",
          parts: [],
          status: "streaming",
        },
      ],
      streaming: true,
    });

    useChatStore.getState().applyEvent("1", {
      event: "toolCall",
      data: {
        id: 10,
        action: { tool: "runCommand", command: "del x", folder: "C:\\test" },
        needsAnswer: true,
      },
    });

    useChatStore.getState().applyEvent("1", {
      event: "error",
      data: { kind: "cancelled" },
    });

    const msg = useChatStore.getState().messages[0];
    expect(msg.status).toBe("stopped");
    expect(msg.parts).toEqual([
      {
        kind: "step",
        step: {
          id: 10,
          action: { tool: "runCommand", command: "del x", folder: "C:\\test" },
          needsAnswer: true,
          outcome: { status: "stopped" },
        },
      },
    ]);
  });

  it("answer marks the step and calls answerTool", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "1",
          role: "assistant",
          text: "",
          parts: [
            {
              kind: "step",
              step: {
                id: 3,
                action: { tool: "runCommand", command: "npm test", folder: "C:\\test" },
                needsAnswer: true,
              },
            },
          ],
          status: "streaming",
        },
      ],
      streaming: true,
    });

    await useChatStore.getState().answer(3, true);

    expect(commands.answerTool).toHaveBeenCalledWith(3, true);
    const step = (useChatStore.getState().messages[0].parts?.[0] as any)?.step;
    expect(step.answered).toBe(true);
  });

  it("saves the user message then the reply", async () => {
    vi.mocked(commands.createConversation).mockResolvedValueOnce({
      status: "ok",
      data: { id: 123, title: "hello", workspacePath: null, updatedAt: 1000, pinned: false, archived: false },
    });
    vi.mocked(commands.appendMessage).mockResolvedValue({
      status: "ok",
      data: 1,
    });

    useModelsStore.setState({
      chatModels: [
        {
          connectionId: 1,
          modelId: "m1",
          displayName: "Model One",
          connectionLabel: "Provider",
          isDefault: true,
          supportsTools: true,
          isLocal: false,
          contextTokens: null,
        },
      ],
    });

    await useChatStore
      .getState()
      .send("hello", { connectionId: 1, modelId: "m1" });

    expect(commands.createConversation).toHaveBeenCalledWith("hello", null);
    expect(useChatStore.getState().conversationId).toBe(123);

    expect(commands.appendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        role: "user",
        status: "complete",
      }),
    );

    const assistantId = useChatStore.getState().messages[1].id;
    useChatStore.getState().applyEvent(assistantId, {
      event: "done",
      data: { tokensIn: 10, tokensOut: 20 },
    });

    expect(commands.appendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        role: "assistant",
        status: "complete",
        modelName: "Model One",
        tokensIn: 10,
        tokensOut: 20,
      }),
    );
  });

  it("saves stopped and failed replies with their status", async () => {
    useChatStore.setState({ conversationId: 123 });
    vi.mocked(commands.appendMessage).mockResolvedValue({
      status: "ok",
      data: 2,
    });

    useChatStore.setState({
      messages: [
        {
          id: "a1",
          role: "assistant",
          text: "part",
          status: "streaming",
          modelName: "Model One",
        },
      ],
    });
    useChatStore.getState().applyEvent("a1", {
      event: "error",
      data: { kind: "cancelled" },
    });
    expect(commands.appendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        role: "assistant",
        status: "stopped",
        errorKind: null,
      }),
    );

    useChatStore.setState({
      messages: [
        {
          id: "a2",
          role: "assistant",
          text: "",
          status: "streaming",
          modelName: "Model One",
        },
      ],
    });
    useChatStore.getState().applyEvent("a2", {
      event: "error",
      data: { kind: "offline" },
    });
    expect(commands.appendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        role: "assistant",
        status: "error",
        errorKind: "offline",
      }),
    );
  });

  it("saves a partial reply after the folder changes", async () => {
    useChatStore.setState({
      conversationId: 7,
      place: "/folder-a",
      conversations: [
        { id: 7, title: "Chat 7", workspacePath: "/folder-a", updatedAt: 100, pinned: false, archived: false },
      ],
    });
    vi.mocked(commands.appendMessage).mockResolvedValue({
      status: "ok",
      data: 1,
    });
    vi.mocked(commands.loadMessages).mockResolvedValue({
      status: "ok",
      data: [],
    });

    await useChatStore.getState().send("hello", { connectionId: 1, modelId: "m1" });
    const channel = vi.mocked(commands.sendMessage).mock.calls[0][4] as any;

    channel.onmessage({ event: "delta", data: "Hel" });

    // User switches folder / loads conversation 9
    await useChatStore.getState().load(9);
    expect(useChatStore.getState().conversationId).toBe(9);

    // Cancelled error arrives for conversation 7's stream
    channel.onmessage({
      event: "error",
      data: { kind: "cancelled" },
    });

    // appendMessage(7, { status: "stopped", ... "Hel" ... })
    expect(commands.appendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        role: "assistant",
        status: "stopped",
        contentParts: expect.stringContaining("Hel"),
      }),
    );
    // Nothing is appended to 9
    const callsTo9 = vi
      .mocked(commands.appendMessage)
      .mock.calls.filter((call) => call[0] === 9);
    expect(callsTo9.length).toBe(0);
  });

  it("opens the newest chat and restores model names", async () => {
    vi.mocked(commands.listConversations).mockResolvedValueOnce({
      status: "ok",
      data: [
        { id: 10, title: "Chat Ten", workspacePath: null, updatedAt: 200, pinned: false, archived: false },
        { id: 9, title: "Chat Nine", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      ],
    });
    vi.mocked(commands.loadMessages).mockResolvedValueOnce({
      status: "ok",
      data: [
        {
          id: 1,
          role: "assistant",
          contentParts: JSON.stringify({ v: 1, text: "hi" }),
          modelRef: "1:m1",
          modelName: "Model One",
          status: "complete",
          errorKind: null,
          tokensIn: null,
          tokensOut: null,
          createdAt: 100,
        },
      ],
    });

    await useChatStore.getState().openPlace(null);

    expect(commands.listConversations).toHaveBeenCalledWith(null);
    expect(commands.loadMessages).toHaveBeenCalledWith(10);
    expect(useChatStore.getState().conversationId).toBe(10);
    expect(useChatStore.getState().messages[0].modelName).toBe("Model One");
  });

  it("openPlace opens the newest unarchived chat", async () => {
    vi.mocked(commands.listConversations).mockResolvedValueOnce({
      status: "ok",
      data: [
        { id: 3, title: "Chat Three", workspacePath: null, updatedAt: 300, pinned: false, archived: true },
        { id: 2, title: "Chat Two", workspacePath: null, updatedAt: 200, pinned: false, archived: false },
        { id: 1, title: "Chat One", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      ],
    });

    await useChatStore.getState().openPlace(null);

    expect(commands.loadMessages).toHaveBeenCalledWith(2);
    expect(useChatStore.getState().conversationId).toBe(2);
  });

  it("archiving the open chat opens the next one", async () => {
    useChatStore.setState({
      conversationId: 2,
      conversations: [
        { id: 2, title: "Chat Two", workspacePath: null, updatedAt: 200, pinned: false, archived: false },
        { id: 1, title: "Chat One", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      ],
    });

    await useChatStore.getState().setArchived(2, true);

    expect(commands.setConversationArchived).toHaveBeenCalledWith(2, true);
    expect(useChatStore.getState().conversationId).toBe(1);

    // Archiving the last remaining opens startNew
    await useChatStore.getState().setArchived(1, true);
    expect(useChatStore.getState().conversationId).toBeNull();
  });

  it("pinning keeps the open chat", async () => {
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Chat One", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      ],
    });

    await useChatStore.getState().setPinned(1, true);

    expect(commands.setConversationPinned).toHaveBeenCalledWith(1, true);
    expect(useChatStore.getState().conversationId).toBe(1);
    expect(useChatStore.getState().conversations[0].pinned).toBe(true);
  });

  it("a failed pin or archive leaves the list and the open chat as they were", async () => {
    const before = [
      { id: 1, title: "Chat One", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      { id: 2, title: "Chat Two", workspacePath: null, updatedAt: 90, pinned: false, archived: false },
    ];
    useChatStore.setState({ conversationId: 1, conversations: before });
    vi.mocked(commands.setConversationPinned).mockResolvedValueOnce({
      status: "error",
      error: { kind: "notFound" },
    });
    vi.mocked(commands.setConversationArchived).mockResolvedValueOnce({
      status: "error",
      error: { kind: "notFound" },
    });

    await useChatStore.getState().setPinned(1, true);
    await useChatStore.getState().setArchived(1, true);

    expect(useChatStore.getState().conversations).toEqual(before);
    expect(useChatStore.getState().conversationId).toBe(1);
    expect(commands.loadMessages).not.toHaveBeenCalled();
  });

  it("sending in an archived chat un-archives it in the list", async () => {
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Archived Chat", workspacePath: null, updatedAt: 100, pinned: false, archived: true },
      ],
    });
    useModelsStore.setState({
      chatModels: [
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m1",
          displayName: "Model 1",
          isDefault: true,
          supportsTools: null,
          isLocal: false,
          contextTokens: null,
        },
      ],
    });

    await useChatStore.getState().send("hello again", { connectionId: 1, modelId: "m1" });

    expect(useChatStore.getState().conversations[0].archived).toBe(false);
  });

  it("remove skips archived chats when choosing the next one", async () => {
    useChatStore.setState({
      conversationId: 3,
      conversations: [
        { id: 3, title: "Chat Three", workspacePath: null, updatedAt: 300, pinned: false, archived: false },
        { id: 2, title: "Chat Two", workspacePath: null, updatedAt: 200, pinned: false, archived: true },
        { id: 1, title: "Chat One", workspacePath: null, updatedAt: 100, pinned: false, archived: false },
      ],
      place: null,
    });

    await useChatStore.getState().remove(3);

    expect(commands.deleteConversation).toHaveBeenCalledWith(3);
    expect(useChatStore.getState().conversationId).toBe(1);
  });
});
