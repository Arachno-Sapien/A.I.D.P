// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    setDefaultModel: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setModelEffort: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { ModelPicker } from "./ModelPicker";

// One test swaps in a spy; the others need the store's own select.
const realSelect = useModelsStore.getState().select;

describe("ModelPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
      ollama: { state: "running", version: "0.5.0" },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("with no models, only a bar with a left control shows", () => {
    // The AI panel passes its Agent switch as children; with no models its bar stays hidden.
    const { container, unmount } = render(
      <ModelPicker>
        <span>Agent</span>
      </ModelPicker>,
    );
    expect(container.firstChild).toBeNull();
    unmount();

    render(<ModelPicker left={<button type="button">Chat list</button>} />);
    expect(screen.getByRole("button", { name: "Chat list" })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
  });

  it("a model download's progress does not re-render the picker", () => {
    const onRender = vi.fn();
    render(
      <Profiler id="picker" onRender={onRender}>
        <ModelPicker left={<span>x</span>} />
      </Profiler>,
    );
    onRender.mockClear();
    act(() => {
      useModelsStore.setState({ pull: { name: "m", status: "pulling", completedMb: 1, totalMb: 9 } });
    });
    expect(onRender).not.toHaveBeenCalled();
  });

  it("selects a local model with a colon", async () => {
    const selectSpy = vi.fn().mockResolvedValue(null);
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
        {
          connectionId: 3,
          connectionLabel: "Ollama (local)",
          modelId: "qwen2.5-coder:1.5b",
          displayName: "qwen2.5-coder:1.5b",
          isDefault: false,
          supportsTools: true,
          isLocal: true,
          contextTokens: 8192,
        },
      ],
      selected: { connectionId: 1, modelId: "m1" },
      loaded: true,
      select: selectSpy,
    });

    render(<ModelPicker />);

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    expect(select.value).toBe("1:m1");

    fireEvent.change(select, { target: { value: "3:qwen2.5-coder:1.5b" } });

    expect(selectSpy).toHaveBeenCalledWith({
      connectionId: 3,
      modelId: "qwen2.5-coder:1.5b",
    });
  });

  it("shows a failed default save and puts the old model back", async () => {
    const model = (id: string) => ({
      connectionId: 1,
      connectionLabel: "OpenRouter",
      modelId: id,
      displayName: id,
      isDefault: id === "m1",
      supportsTools: null,
      isLocal: false,
      contextTokens: null,
    });
    useModelsStore.setState({
      chatModels: [model("m1"), model("m2")],
      selected: { connectionId: 1, modelId: "m1" },
      loaded: true,
      loadError: null,
      select: realSelect,
    });
    vi.mocked(commands.setDefaultModel).mockResolvedValueOnce({
      status: "error",
      error: { kind: "storage", message: "disk full" },
    });

    render(<ModelPicker />);
    const select = screen.getByLabelText("Model") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "1:m2" } });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't read or write the local database: disk full",
    );
    expect(select.value).toBe("1:m1");
    expect(useModelsStore.getState().loadError).toBeNull();

    fireEvent.change(select, { target: { value: "1:m2" } });

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(select.value).toBe("1:m2");
  });

  it("disables local models when Ollama is stopped", () => {
    useModelsStore.setState({
      ollama: { state: "stopped" },
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
        {
          connectionId: 3,
          connectionLabel: "Ollama (local)",
          modelId: "qwen2.5-coder:1.5b",
          displayName: "qwen2.5-coder:1.5b",
          isDefault: false,
          supportsTools: true,
          isLocal: true,
          contextTokens: 8192,
        },
      ],
      selected: { connectionId: 1, modelId: "m1" },
      loaded: true,
    });

    render(<ModelPicker />);

    const localOpt = screen.getByRole("option", {
      name: "qwen2.5-coder:1.5b (Ollama stopped)",
    }) as HTMLOptionElement;

    expect(localOpt).toBeDefined();
    expect(localOpt.disabled).toBe(true);

    const cloudOpt = screen.getByRole("option", {
      name: "Model 1",
    }) as HTMLOptionElement;
    expect(cloudOpt.disabled).toBe(false);
  });

  it("groups local models under Local · Ollama", () => {
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
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
        {
          connectionId: 3,
          connectionLabel: "Ollama (local)",
          modelId: "qwen2.5-coder:1.5b",
          displayName: "qwen2.5-coder:1.5b",
          isDefault: false,
          supportsTools: true,
          isLocal: true,
          contextTokens: 8192,
        },
      ],
      selected: { connectionId: 1, modelId: "m1" },
      loaded: true,
    });

    render(<ModelPicker />);

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    const optgroups = select.querySelectorAll("optgroup");
    expect(optgroups.length).toBe(2);
    expect(optgroups[0]?.getAttribute("label")).toBe("OpenRouter");
    expect(optgroups[1]?.getAttribute("label")).toBe("Local · Ollama");
  });

  it("the effort select follows the current model", async () => {
    const a = {
      connectionId: 1, connectionLabel: "OpenRouter", modelId: "a", displayName: "Model A",
      isDefault: true, supportsTools: null, isLocal: false, contextTokens: null,
      effort: "high" as const,
    };
    const b = { ...a, modelId: "b", displayName: "Model B", isDefault: false, effort: "low" as const };
    useModelsStore.setState({ chatModels: [a, b], selected: { connectionId: 1, modelId: "a" }, loaded: true });
    render(<ModelPicker />);

    const effort = () => screen.getByRole("combobox", { name: /effort$/ }) as HTMLSelectElement;
    expect(effort().value).toBe("high");

    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "1:b" } });
    await waitFor(() => expect(effort().value).toBe("low"));

    // The reload after a save brings the stored list back (b is now the saved default), old value included.
    vi.mocked(commands.chatModels).mockResolvedValue({ status: "ok", data: [{ ...a, isDefault: false }, { ...b, isDefault: true }] });
    vi.mocked(commands.setModelEffort).mockResolvedValueOnce({
      status: "error",
      error: { kind: "storage", message: "locked" } as never,
    });
    fireEvent.change(effort(), { target: { value: "medium" } });
    await waitFor(() => {
      expect(commands.setModelEffort).toHaveBeenCalledWith(1, "b", "medium");
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(effort().value).toBe("low");
  });
});
