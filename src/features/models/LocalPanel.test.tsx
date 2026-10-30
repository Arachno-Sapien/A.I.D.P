// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalPanel } from "./LocalPanel";
import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    ollamaStatus: vi.fn().mockResolvedValue({
      status: "ok",
      data: { state: "running", version: "0.5.0" },
    }),
    ollamaStart: vi.fn(),
    ollamaOpenDownload: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    ollamaModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    ollamaPull: vi.fn(),
    ollamaCancelPull: vi.fn().mockResolvedValue(undefined),
    ollamaDelete: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    ollamaUnload: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setModelContext: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

afterEach(() => {
  cleanup();
});

describe("LocalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelsStore.setState({
      ollama: null,
      localModels: [],
      pull: null,
      connections: [],
      chatModels: [],
      selected: null,
      loaded: true,
      loadError: null,
    });
  });

  it("shows each Ollama state", async () => {
    // 1. Not installed
    useModelsStore.setState({ ollama: { state: "notInstalled" } });
    const { rerender } = render(<LocalPanel />);

    expect(screen.getByText("Ollama runs models on this computer.")).toBeDefined();
    const getBtn = screen.getByRole("button", { name: "Get Ollama" });
    fireEvent.click(getBtn);
    expect(commands.ollamaOpenDownload).toHaveBeenCalled();

    // 2. Stopped
    useModelsStore.setState({ ollama: { state: "stopped" } });
    rerender(<LocalPanel />);

    const startBtn = screen.getByRole("button", { name: "Start" });
    vi.mocked(commands.ollamaStart).mockResolvedValueOnce({
      status: "ok",
      data: { state: "running", version: "0.5.0" },
    });
    vi.mocked(commands.ollamaStatus).mockResolvedValueOnce({
      status: "ok",
      data: { state: "running", version: "0.5.0" },
    });
    fireEvent.click(startBtn);
    expect(commands.ollamaStart).toHaveBeenCalled();

    // 3. Running with no models: shows suggestions
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      localModels: [],
    });
    rerender(<LocalPanel />);

    expect(screen.getByText(/qwen2\.5-coder:1\.5b/i)).toBeDefined();
    expect(screen.getByText(/986 MB/i)).toBeDefined();
  });

  it("downloads with progress and cancel", async () => {
    let channelRef: any = null;
    let resolvePull: (val: any) => void = () => {};
    vi.mocked(commands.ollamaPull).mockImplementation((_name, channel) => {
      channelRef = channel;
      return new Promise((resolve) => {
        resolvePull = resolve;
      });
    });

    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      localModels: [],
    });

    render(<LocalPanel />);

    const downloadButtons = screen.getAllByRole("button", { name: /download/i });
    fireEvent.click(downloadButtons[0]);

    expect(commands.ollamaPull).toHaveBeenCalledWith(
      "qwen2.5-coder:1.5b",
      expect.anything(),
    );

    // Simulate progress
    channelRef?.onmessage({
      event: "progress",
      data: {
        status: "downloading layer",
        completedMb: 50,
        totalMb: 100,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/50%/)).toBeDefined();
    });

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(commands.ollamaCancelPull).toHaveBeenCalled();

    resolvePull({ status: "ok", data: null });
  });

  it("keeps a download going across screens", async () => {
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      pull: {
        name: "test-model:1b",
        status: "downloading",
        completedMb: 25,
        totalMb: 100,
      },
    });

    const { unmount } = render(<LocalPanel />);
    expect(screen.getByText(/25%/)).toBeDefined();
    unmount();

    // Store update while unmounted
    useModelsStore.setState({
      pull: {
        name: "test-model:1b",
        status: "downloading",
        completedMb: 75,
        totalMb: 100,
      },
    });

    render(<LocalPanel />);
    expect(screen.getByText(/75%/)).toBeDefined();
  });

  it("warns about large downloads", () => {
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      pull: {
        name: "large:7b",
        status: "downloading",
        completedMb: 1000,
        totalMb: 5000,
      },
    });

    const { rerender } = render(<LocalPanel />);
    expect(
      screen.getByText("Needs about 8 GB of free memory"),
    ).toBeDefined();

    useModelsStore.setState({
      pull: {
        name: "huge:14b",
        status: "downloading",
        completedMb: 1000,
        totalMb: 9000,
      },
    });
    rerender(<LocalPanel />);
    expect(
      screen.getByText("Too large for most machines without a GPU"),
    ).toBeDefined();
  });

  it("deletes after confirming and frees memory", async () => {
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      localModels: [
        {
          name: "qwen2.5-coder:1.5b",
          sizeMb: 986,
          parameterSize: "1.5B",
          quantization: "Q4_K_M",
          supportsTools: true,
          contextLength: 32768,
          numCtx: 8192,
          loaded: {
            name: "qwen2.5-coder:1.5b",
            sizeMb: 986,
            vramMb: 0,
            expiresAt: "2026-10-30T12:00:00Z",
          },
        },
      ],
    });

    render(<LocalPanel />);

    expect(screen.getByText("Tools")).toBeDefined();
    expect(screen.getByText(/Loaded · 986 MB/i)).toBeDefined();

    // Free memory
    const freeBtn = screen.getByRole("button", { name: "Free memory" });
    fireEvent.click(freeBtn);
    expect(commands.ollamaUnload).toHaveBeenCalledWith("qwen2.5-coder:1.5b");

    // Delete flow: asks confirmation
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Delete qwen2\.5-coder:1\.5b\? It frees/i)).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: "Confirm delete" });
    fireEvent.click(confirmBtn);
    expect(commands.ollamaDelete).toHaveBeenCalledWith("qwen2.5-coder:1.5b");
  });

  it("sets the context length", async () => {
    useModelsStore.setState({
      ollama: { state: "running", version: "0.5.0" },
      localModels: [
        {
          name: "qwen2.5-coder:1.5b",
          sizeMb: 986,
          parameterSize: "1.5B",
          quantization: "Q4_K_M",
          supportsTools: true,
          contextLength: 32768,
          numCtx: 8192,
          loaded: null,
        },
      ],
    });

    render(<LocalPanel />);

    const select = screen.getByLabelText(/context length/i) as HTMLSelectElement;
    expect(select.value).toBe("8192");

    fireEvent.change(select, { target: { value: "4096" } });
    expect(commands.setModelContext).toHaveBeenCalledWith(
      "qwen2.5-coder:1.5b",
      4096,
    );
  });
});

describe("LocalPanel errors", () => {
  it("shows why an action failed", () => {
    useModelsStore.setState({
      ollama: { state: "stopped" },
      ollamaError: "Ollama didn't start. Try starting it from the Start menu.",
    });
    render(<LocalPanel />);
    expect(screen.getByText("Ollama didn't start. Try starting it from the Start menu.")).toBeDefined();
  });
});
