// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn(),
    chatModels: vi.fn(),
    sendMessage: vi.fn(),
    stopReply: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    loadMessages: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createConversation: vi.fn().mockResolvedValue({
      status: "ok",
      data: { id: 1, title: "test", workspacePath: null, updatedAt: 100 },
    }),
    deleteConversation: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    appendMessage: vi.fn().mockResolvedValue({ status: "ok", data: 1 }),
  },
}));

import { useModelsStore } from "../models/store";
import { useChatStore } from "./store";
import { ChatScreen, useChatLayout } from "./ChatScreen";

describe("ChatScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatLayout?.setState?.({ listOpen: true, listWidth: 240 });
    useChatStore.setState({
      messages: [],
      streaming: false,
    });
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: false,
      loadError: null,
      ollama: null,
      localModels: [],
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
          isLocal: false,
          contextTokens: null,
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: false,
          isLocal: false,
          contextTokens: null,
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

  it("suggests a local download", () => {
    useModelsStore.setState({
      connections: [
        {
          id: 3,
          kind: "ollama",
          label: "Ollama (local)",
          baseUrl: "http://127.0.0.1:11434",
          keyHint: "",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
      ollama: { state: "running", version: "0.5.0" },
    });

    const onNavigate = vi.fn();
    render(
      <ChatScreen onStartAdding={vi.fn()} onNavigateToModels={onNavigate} />,
    );

    expect(screen.getByText("Download a local model")).toBeDefined();
    const btn = screen.getByRole("button", { name: "Go to Models" });
    expect(btn).toBeDefined();
    btn.click();
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("ChatScreen history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatLayout?.setState?.({ listOpen: true, listWidth: 240 });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the newest chat only on the first visit", () => {
    // Coming back to Chat reloaded the newest chat, dropping a reply still streaming.
    const openPlace = vi.fn(async () => {
      useChatStore.setState({ opened: true });
    });
    useChatStore.setState({ openPlace, opened: false });

    const first = render(<ChatScreen />);
    first.unmount();
    render(<ChatScreen />);

    expect(openPlace).toHaveBeenCalledTimes(1);
  });

  it("the chat list hides and shows from its button", () => {
    render(<ChatScreen />);
    const toggleBtn = screen.getByRole("button", { name: "Chat list" });
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "New chat" })).toBeDefined();

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "New chat" })).toBeDefined();
  });

  it("Ctrl+B toggles the chat list", () => {
    render(<ChatScreen />);
    expect(screen.getByRole("button", { name: "New chat" })).toBeDefined();

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByRole("button", { name: "New chat" })).toBeDefined();
  });

  it("the chat list keeps its state when Chat is shown again", () => {
    const { unmount } = render(<ChatScreen />);
    const toggleBtn = screen.getByRole("button", { name: "Chat list" });
    fireEvent.click(toggleBtn);
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();

    unmount();

    render(<ChatScreen />);
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
  });

  it("the chat list resizes by keyboard and stays within its limits", () => {
    const { container } = render(<ChatScreen />);
    const row = container.querySelector(".flex-1.flex.flex-row") as HTMLElement | null;
    if (row) {
      Object.defineProperty(row, "clientWidth", { value: 1000, configurable: true });
    }
    const splitter = screen.getByRole("separator", { name: "Resize chat list" });
    splitter.focus();

    fireEvent.keyDown(splitter, { key: "ArrowRight" });
    expect(splitter.getAttribute("aria-valuenow")).toBe("256");

    fireEvent.keyDown(splitter, { key: "End" });
    expect(splitter.getAttribute("aria-valuenow")).toBe("640");

    fireEvent.keyDown(splitter, { key: "Home" });
    expect(splitter.getAttribute("aria-valuenow")).toBe("180");
  });
});
