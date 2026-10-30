// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    getSettings: vi.fn().mockResolvedValue({
      status: "ok",
      data: { theme: "dark", keepAlive: "ollamaDefault" },
    }),
    setTheme: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setKeepAlive: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setDefaultModel: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { useSettingsStore } from "./store";
import { SettingsScreen } from "./SettingsScreen";

describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      theme: "dark",
      keepAlive: "ollamaDefault",
      loaded: true,
      loadError: null,
    });
    useModelsStore.setState({
      connections: [],
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
  });

  afterEach(() => {
    cleanup();
  });

  it("changes the default model", async () => {
    render(<SettingsScreen />);

    const select = screen.getByLabelText("Default model") as HTMLSelectElement;
    expect(select.value).toBe("1:m1");

    fireEvent.change(select, { target: { value: "3:qwen2.5-coder:1.5b" } });

    expect(commands.setDefaultModel).toHaveBeenCalledWith(
      3,
      "qwen2.5-coder:1.5b",
    );
  });

  it("saves theme and keep alive", async () => {
    render(<SettingsScreen />);

    // Click Light theme
    const lightBtn = screen.getByRole("button", { name: "Light" });
    fireEvent.click(lightBtn);

    expect(commands.setTheme).toHaveBeenCalledWith("light");

    // Click 1 hour keep alive
    const oneHourOpt = screen.getByRole("button", { name: /1 hour/i });
    fireEvent.click(oneHourOpt);

    expect(commands.setKeepAlive).toHaveBeenCalledWith("oneHour");
  });
});

