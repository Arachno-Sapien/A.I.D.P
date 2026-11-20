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
    setModelVision: vi.fn(),
    addConnection: vi.fn(),
  },
}));

const conn = (id: number, label: string) => ({
  id,
  kind: "openaiCompat" as const,
  label,
  baseUrl: "https://api.com",
  keyHint: "1234",
  lastTestedAt: null,
  lastTestOk: null,
});

import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";
import { ModelsScreen } from "./ModelsScreen";

describe("ModelsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({ loadError: null });
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
      selected: null,
      loaded: true,
    });

    vi.mocked(commands.availableModels).mockResolvedValue({
      status: "ok",
      data: [
        { id: "m1", displayName: "Model 1", contextWindow: null, supportsTools: null, effortSupport: null },
        { id: "m2", displayName: "Model 2", contextWindow: null, supportsTools: null, effortSupport: null },
        { id: "m3", displayName: "Model 3", contextWindow: null, supportsTools: null, effortSupport: null },
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
        { id: "m1", displayName: "Model 1", contextWindow: null, supportsTools: null, effortSupport: null },
        { id: "m2", displayName: "Model 2", contextWindow: null, supportsTools: null, effortSupport: null },
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

  it("hides Ollama from cloud connections", () => {
    useModelsStore.setState({
      connections: [
        {
          id: 1,
          kind: "ollama",
          label: "Ollama (local)",
          baseUrl: "http://127.0.0.1:11434",
          keyHint: "",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        {
          id: 2,
          kind: "openaiCompat",
          label: "Cloud OpenAI",
          baseUrl: "https://api.openai.com/v1",
          keyHint: "9999",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
      chatModels: [],
      selected: null,
      loaded: true,
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    expect(screen.getByText("Cloud OpenAI")).toBeDefined();
    expect(screen.queryByText("Ollama (local)")).toBeNull();
  });

  it("Cancel on Choose models after a saved add shows the new connection", async () => {
    useModelsStore.setState({ connections: [], chatModels: [], selected: null, loaded: true, loadError: null });
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: { connection: conn(7, "New Conn"), available: [] },
    });
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [conn(7, "New Conn")] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });

    render(<ModelsScreen startAdding />);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openrouter" } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-...XXXX" } });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));
    await screen.findByText(/The connection is saved/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("New Conn")).toBeDefined();
  });

  it("a successful key replace clears the old test error", async () => {
    useModelsStore.setState({ connections: [conn(1, "Test Conn")], chatModels: [], selected: null, loaded: true, loadError: null });
    vi.mocked(commands.testConnection).mockResolvedValue({
      status: "error",
      error: { kind: "provider", error: { kind: "invalidKey" } },
    });
    vi.mocked(commands.replaceKey).mockResolvedValue({ status: "ok", data: conn(1, "Test Conn") });
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [conn(1, "Test Conn")] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });
    const errText = "The provider rejected the API key. Check the key and try again.";

    render(<ModelsScreen onAddClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText(errText)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
    fireEvent.change(screen.getByPlaceholderText("New API key (sk-...)"), { target: { value: "sk-...XXXX" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText(errText)).toBeNull());
  });

  it("a finished Test does not re-enable another one still running", async () => {
    useModelsStore.setState({ connections: [conn(1, "A"), conn(2, "B")], chatModels: [], selected: null, loaded: true, loadError: null });
    let finishA: (v: { status: "ok"; data: null }) => void = () => {};
    vi.mocked(commands.testConnection).mockImplementation((id) =>
      id === 1 ? new Promise((r) => { finishA = r; }) : new Promise(() => {}),
    );
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [conn(1, "A"), conn(2, "B")] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });

    render(<ModelsScreen onAddClick={vi.fn()} />);
    const [testA, testB] = screen.getAllByRole("button", { name: "Test" });
    fireEvent.click(testA);
    fireEvent.click(testB);
    finishA({ status: "ok", data: null });

    await waitFor(() => expect(commands.listConnections).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Testing..." })).toBeDefined();
  });

  it("a load error keeps the Ollama panel and hides the empty state", () => {
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
      loadError: "Couldn't read or write the local database: locked",
      ollama: null,
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    expect(screen.getByText("Couldn't read or write the local database: locked")).toBeDefined();
    expect(screen.getByText("Ollama (local models)")).toBeDefined();
    expect(screen.queryByText("No cloud models yet")).toBeNull();
  });

  it("marks a cloud model as reading images", async () => {
    const cloud = {
      id: 1,
      kind: "openaiCompat" as const,
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      keyHint: "1234",
      lastTestedAt: 100,
      lastTestOk: true,
    };
    const model = {
      connectionId: 1,
      connectionLabel: "OpenRouter",
      modelId: "anthropic/claude",
      displayName: "Claude",
      isDefault: true,
      supportsTools: true,
      isLocal: false,
      contextTokens: null,
    };
    useModelsStore.setState({
      connections: [cloud],
      chatModels: [model],
      selected: null,
      loaded: true,
    });
    vi.mocked(commands.setModelVision).mockResolvedValue({ status: "ok", data: null });
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [cloud] });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [{ ...model, supportsVision: true }],
    });

    render(<ModelsScreen onAddClick={vi.fn()} />);

    const select = screen.getByRole("combobox", {
      name: "Claude reads images",
    }) as HTMLSelectElement;
    expect(select.value).toBe("unknown");

    fireEvent.change(select, { target: { value: "yes" } });

    await waitFor(() => {
      expect(commands.setModelVision).toHaveBeenCalledWith(1, "anthropic/claude", true);
      expect(select.value).toBe("yes");
    });

    fireEvent.change(select, { target: { value: "unknown" } });
    await waitFor(() => {
      expect(commands.setModelVision).toHaveBeenLastCalledWith(1, "anthropic/claude", null);
    });
  });
});
