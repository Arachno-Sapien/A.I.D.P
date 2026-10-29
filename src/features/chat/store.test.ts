import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    sendMessage: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    stopReply: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands } from "../../lib/bindings";
import { useChatStore } from "./store";

describe("useChatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      messages: [],
      streaming: false,
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
});
