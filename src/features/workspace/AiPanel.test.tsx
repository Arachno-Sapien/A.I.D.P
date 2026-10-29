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

  it("Stop stops only the workspace reply", async () => {
    useWorkspaceChatStore.setState({ streaming: true });

    render(<AiPanel />);

    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stopBtn);

    expect(commands.stopReply).toHaveBeenCalledWith("workspace");
  });
});
