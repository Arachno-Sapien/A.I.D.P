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
});
