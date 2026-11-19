import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn(),
    chatModels: vi.fn(),
    setDefaultModel: vi.fn(),
    ollamaStatus: vi.fn(),
    ollamaModels: vi.fn(),
    ollamaPull: vi.fn(),
    ollamaCancelPull: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands } from "../../lib/bindings";
import { parseModelKey, useModelsStore } from "./store";

describe("useModelsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: false,
    });
  });

  it("selects the default chat model", async () => {
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "ok",
      data: [
        {
          id: 1,
          kind: "openaiCompat",
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          keyHint: "cdef",
          lastTestedAt: 100,
          lastTestOk: true,
        },
      ],
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m1",
          displayName: "Model 1",
          isDefault: false,
          supportsTools: null,
          isLocal: false,
          contextTokens: null,
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: true,
          supportsTools: null,
          isLocal: false,
          contextTokens: null,
        },
      ],
    });

    await useModelsStore.getState().refresh();

    const state = useModelsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.connections.length).toBe(1);
    expect(state.chatModels.length).toBe(2);
    expect(state.selected).toEqual({ connectionId: 1, modelId: "m2" });
  });

  it("falls back to the first chat model", async () => {
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "ok",
      data: [],
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m1",
          displayName: "Model 1",
          isDefault: false,
          supportsTools: null,
          isLocal: false,
          contextTokens: null,
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: false,
          supportsTools: null,
          isLocal: false,
          contextTokens: null,
        },
      ],
    });

    await useModelsStore.getState().refresh();

    const state = useModelsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.selected).toEqual({ connectionId: 1, modelId: "m1" });
  });

  it("leaves selected null when there are no chat models", async () => {
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "ok",
      data: [],
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [],
    });

    await useModelsStore.getState().refresh();

    const state = useModelsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.selected).toBeNull();
  });

  it("select saves the default model", async () => {
    vi.mocked(commands.setDefaultModel).mockResolvedValue({
      status: "ok",
      data: null,
    });

    await useModelsStore.getState().select({ connectionId: 2, modelId: "m2" });

    expect(commands.setDefaultModel).toHaveBeenCalledWith(2, "m2");
    expect(useModelsStore.getState().selected).toEqual({
      connectionId: 2,
      modelId: "m2",
    });
  });

  it("a failed select puts the old model back and returns why", async () => {
    useModelsStore.setState({
      selected: { connectionId: 1, modelId: "m1" },
      loadError: null,
    });
    vi.mocked(commands.setDefaultModel).mockResolvedValue({
      status: "error",
      error: { kind: "storage", message: "disk full" },
    });

    const err = await useModelsStore
      .getState()
      .select({ connectionId: 2, modelId: "m2" });

    expect(err).toBe("Couldn't read or write the local database: disk full");
    expect(useModelsStore.getState().selected).toEqual({
      connectionId: 1,
      modelId: "m1",
    });
    // loadError would replace the whole chat screen.
    expect(useModelsStore.getState().loadError).toBeNull();
  });

  it("cancel keeps the pull until the pull itself returns", async () => {
    vi.mocked(commands.ollamaCancelPull).mockResolvedValue(undefined);
    let resolvePull: (v: unknown) => void = () => {};
    vi.mocked(commands.ollamaPull).mockReturnValue(
      new Promise((r) => {
        resolvePull = r;
      }) as never,
    );
    useModelsStore.setState({ pull: null, pullError: null });

    const pulling = useModelsStore.getState().pullModel("a:1b");
    await useModelsStore.getState().cancelPull();

    expect(useModelsStore.getState().pull).toMatchObject({
      name: "a:1b",
      cancelling: true,
    });

    resolvePull({
      status: "error",
      error: { kind: "provider", error: { kind: "cancelled" } },
    });
    await pulling;
    expect(useModelsStore.getState().pull).toBeNull();
    expect(useModelsStore.getState().pullError).toBeNull();
  });

  it("a late result from a cancelled pull leaves a newer pull alone", async () => {
    vi.mocked(commands.ollamaCancelPull).mockResolvedValue(undefined);
    const resolvers: Array<(v: unknown) => void> = [];
    vi.mocked(commands.ollamaPull).mockImplementation(
      () =>
        new Promise((r) => {
          resolvers.push(r);
        }) as never,
    );
    vi.mocked(commands.ollamaStatus).mockResolvedValue({
      status: "ok",
      data: { state: "notInstalled" } as never,
    });
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });
    useModelsStore.setState({ pull: null, pullError: null });

    const first = useModelsStore.getState().pullModel("a:1b");
    await useModelsStore.getState().cancelPull();
    const second = useModelsStore.getState().pullModel("b:1b");

    resolvers[0]({
      status: "error",
      error: { kind: "provider", error: { kind: "cancelled" } },
    });
    await first;
    expect(useModelsStore.getState().pull?.name).toBe("b:1b");

    resolvers[1]({ status: "ok", data: null });
    await second;
    expect(useModelsStore.getState().pull).toBeNull();
  });

  it("refresh failure sets loadError", async () => {
    vi.mocked(commands.listConnections).mockResolvedValue({
      status: "error",
      error: { kind: "storage", message: "disk read error" },
    });
    vi.mocked(commands.chatModels).mockResolvedValue({
      status: "ok",
      data: [],
    });

    await useModelsStore.getState().refresh();

    const state = useModelsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.loadError).toBe(
      "Couldn't read or write the local database: disk read error",
    );
  });

  it("cloud models load without waiting for Ollama", async () => {
    vi.mocked(commands.ollamaStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });

    void useModelsStore.getState().refreshOllama();

    await vi.waitFor(() => expect(useModelsStore.getState().loaded).toBe(true));
  });

  it("refreshOllama refreshes again after the Ollama sync", async () => {
    vi.mocked(commands.ollamaStatus).mockResolvedValue({
      status: "ok",
      data: { state: "notInstalled" } as never,
    });
    vi.mocked(commands.listConnections).mockResolvedValue({ status: "ok", data: [] });
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [] });

    await useModelsStore.getState().refreshOllama();

    expect(commands.chatModels).toHaveBeenCalledTimes(2);
    expect(vi.mocked(commands.chatModels).mock.invocationCallOrder[1]).toBeGreaterThan(
      vi.mocked(commands.ollamaStatus).mock.invocationCallOrder[0],
    );
  });

  it("parses keys on the first colon", () => {
    expect(parseModelKey("3:qwen2.5-coder:1.5b")).toEqual({
      connectionId: 3,
      modelId: "qwen2.5-coder:1.5b",
    });
    expect(parseModelKey("x:y")).toBeNull();
    expect(parseModelKey("3")).toBeNull();
    expect(parseModelKey("")).toBeNull();
  });
});
