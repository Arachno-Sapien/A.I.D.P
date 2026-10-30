// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    setDefaultModel: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

import { useModelsStore } from "../models/store";
import { ModelPicker } from "./ModelPicker";

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

  it("selects a local model with a colon", async () => {
    const selectSpy = vi.fn();
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
});
