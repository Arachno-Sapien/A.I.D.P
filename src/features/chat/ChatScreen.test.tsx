// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn(),
    chatModels: vi.fn(),
    sendMessage: vi.fn(),
    stopReply: vi.fn(),
  },
}));

import { useModelsStore } from "../models/store";
import { useChatStore } from "./store";
import { ChatScreen } from "./ChatScreen";

describe("ChatScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      messages: [],
      streaming: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("offers Add a model on first run", () => {
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    render(<ChatScreen onStartAdding={vi.fn()} onNavigateToModels={vi.fn()} />);

    expect(
      screen.getByText("Add a model to start chatting"),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add a model" }),
    ).toBeDefined();

    const textarea = screen.getByPlaceholderText(
      "Type a message... (Shift+Enter for newline)",
    ) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("lists models grouped by connection", () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
      chatModels: [
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m1",
          displayName: "Model 1",
          isDefault: true,
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: false,
        },
      ],
      selected: { connectionId: 1, modelId: "m1" },
      loaded: true,
    });

    render(<ChatScreen onStartAdding={vi.fn()} onNavigateToModels={vi.fn()} />);

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe("1:m1");

    const optgroup = select.querySelector("optgroup");
    expect(optgroup?.getAttribute("label")).toBe("OpenRouter");
    expect(optgroup?.children.length).toBe(2);
  });

  it("shows the load error instead of the first-run screen", () => {
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
      loadError: "Couldn't read or write the local database: disk error",
    });

    render(<ChatScreen onStartAdding={vi.fn()} onNavigateToModels={vi.fn()} />);

    expect(
      screen.getByText("Couldn't read or write the local database: disk error"),
    ).toBeDefined();
    expect(screen.queryByText("Add a model to start chatting")).toBeNull();
  });
});
