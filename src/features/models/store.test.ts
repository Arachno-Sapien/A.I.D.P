import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn(),
    chatModels: vi.fn(),
    setDefaultModel: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";

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
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: true,
          supportsTools: null,
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
        },
        {
          connectionId: 1,
          connectionLabel: "OpenRouter",
          modelId: "m2",
          displayName: "Model 2",
          isDefault: false,
          supportsTools: null,
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
});
