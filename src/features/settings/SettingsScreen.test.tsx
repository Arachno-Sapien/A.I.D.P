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
    setCheckUpdates: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    appVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkUpdate: vi.fn(),
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { useSettingsStore } from "./store";
import { SettingsScreen } from "./SettingsScreen";
import { useUpdatesStore } from "./updates";

describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      theme: "dark",
      keepAlive: "ollamaDefault",
      checkUpdatesAtStart: true,
      loaded: true,
      loadError: null,
    });
    useUpdatesStore.setState({
      version: null,
      found: null,
      checking: false,
      upToDate: false,
      error: null,
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

  it("Check for updates reports each result", async () => {
    vi.mocked(commands.checkUpdate).mockResolvedValueOnce({ status: "ok", data: null });
    render(<SettingsScreen />);
    expect(await screen.findByText("Version 0.1.0")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("You're up to date.")).toBeDefined();

    vi.mocked(commands.checkUpdate).mockResolvedValueOnce({
      status: "error",
      error: { kind: "update", message: "Couldn't check for updates: offline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Couldn't check for updates: offline")).toBeDefined();
    expect(screen.queryByText("You're up to date.")).toBeNull();
  });

  it("turns the start-up update check off", () => {
    render(<SettingsScreen />);
    const box = screen.getByRole("checkbox", { name: "Check for updates at start" });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(commands.setCheckUpdates).toHaveBeenCalledWith(false);
  });
});

