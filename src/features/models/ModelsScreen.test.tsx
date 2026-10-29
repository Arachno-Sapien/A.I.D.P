// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn(),
    chatModels: vi.fn(),
    testConnection: vi.fn(),
    replaceKey: vi.fn(),
    deleteConnection: vi.fn(),
    availableModels: vi.fn(),
    setModels: vi.fn(),
    setDefaultModel: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";
import { ModelsScreen } from "./ModelsScreen";

describe("ModelsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("masks the key and shows only the hint", () => {
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
      chatModels: [],
      selected: null,
      loaded: true,
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    expect(screen.getByText("••••••••1234")).toBeDefined();
  });

  it("asks before deleting", async () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "To Delete",
          baseUrl: "https://api.com",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.deleteConnection).mockResolvedValue({
      status: "ok",
      data: null,
    });
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "ok",
      data: [],
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [],
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(commands.deleteConnection).not.toHaveBeenCalled();
    expect(
      screen.getByText("Delete this connection and its key?"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(commands.deleteConnection).toHaveBeenCalledWith(1);
    });
  });

  it("shows the test result", async () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "Test Conn",
          baseUrl: "https://api.com",
          keyHint: "1234",
          lastTestedAt: null,
          lastTestOk: null,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.testConnection).mockResolvedValue({
      status: "error",
      error: {
        kind: "provider",
        error: { kind: "invalidKey" },
      },
    });
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "ok",
      data: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "Test Conn",
          baseUrl: "https://api.com",
          keyHint: "1234",
          lastTestedAt: 200,
          lastTestOk: false,
        },
      ],
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [],
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "The provider rejected the API key. Check the key and try again.",
        ),
      ).toBeDefined();
    });
  });

  it("choose models starts with the current picks ticked", async () => {
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
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.availableModels).mockResolvedValue({
      status: "ok",
      data: [
        { id: "m1", displayName: "Model 1", contextWindow: null },
        { id: "m2", displayName: "Model 2", contextWindow: null },
        { id: "m3", displayName: "Model 3", contextWindow: null },
      ],
    });
    vi.mocked(commands.setModels).mockResolvedValue({
      status: "ok",
      data: null,
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose models" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Model 1")).toBeDefined();
    });

    const m1Checkbox = screen.getByLabelText("Model 1") as HTMLInputElement;
    const m2Checkbox = screen.getByLabelText("Model 2") as HTMLInputElement;
    const m3Checkbox = screen.getByLabelText("Model 3") as HTMLInputElement;

    expect(m1Checkbox.checked).toBe(true);
    expect(m2Checkbox.checked).toBe(true);
    expect(m3Checkbox.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(commands.setModels).toHaveBeenCalledWith(1, [
        { id: "m1", displayName: "Model 1", contextWindow: null },
        { id: "m2", displayName: "Model 2", contextWindow: null },
      ]);
    });
  });

  it("a failed delete shows the error and keeps the card", async () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "To Delete",
          baseUrl: "https://api.com",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.deleteConnection).mockResolvedValue({
      status: "error",
      error: { kind: "keychain", message: "locked" },
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't use the system keychain: locked. On Linux this needs GNOME Keyring or KWallet.",
        ),
      ).toBeDefined();
    });

    expect(screen.getByText("To Delete")).toBeDefined();
  });

  it("a failed model list shows the error", async () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "Test Conn",
          baseUrl: "https://api.com",
          keyHint: "1234",
          lastTestedAt: null,
          lastTestOk: null,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.availableModels).mockResolvedValue({
      status: "error",
      error: {
        kind: "provider",
        error: { kind: "invalidKey" },
      },
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose models" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "The provider rejected the API key. Check the key and try again.",
        ),
      ).toBeDefined();
    });
  });
});
