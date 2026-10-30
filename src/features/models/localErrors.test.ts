import { beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    ollamaStart: vi.fn(),
    ollamaStatus: vi.fn().mockResolvedValue({ status: "ok", data: { state: "stopped" } }),
    ollamaModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    ollamaPull: vi.fn(),
    ollamaCancelPull: vi.fn().mockResolvedValue(null),
    ollamaDelete: vi.fn(),
    ollamaUnload: vi.fn(),
    setModelContext: vi.fn(),
    listConnections: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    chatModels: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";

beforeEach(() => {
  useModelsStore.setState({ ollamaError: null, pullError: null, pull: null });
});

it("shows why Start failed", async () => {
  vi.mocked(commands.ollamaStart).mockResolvedValue({
    status: "error",
    error: { kind: "ollama", message: "Ollama didn't start. Try starting it from the Start menu." },
  });
  await useModelsStore.getState().startOllama();
  expect(useModelsStore.getState().ollamaError).toBe(
    "Ollama didn't start. Try starting it from the Start menu.",
  );
});

it("shows why Delete, Free memory and the context setting failed", async () => {
  const failed = { status: "error" as const, error: { kind: "ollama" as const, message: "nope" } };
  vi.mocked(commands.ollamaDelete).mockResolvedValue(failed);
  await useModelsStore.getState().deleteLocal("a:1b");
  expect(useModelsStore.getState().ollamaError).toBe("nope");

  useModelsStore.setState({ ollamaError: null });
  vi.mocked(commands.ollamaUnload).mockResolvedValue(failed);
  await useModelsStore.getState().unloadLocal("a:1b");
  expect(useModelsStore.getState().ollamaError).toBe("nope");

  useModelsStore.setState({ ollamaError: null });
  vi.mocked(commands.setModelContext).mockResolvedValue(failed);
  await useModelsStore.getState().setContext("a:1b", 4096);
  expect(useModelsStore.getState().ollamaError).toBe("nope");
});

it("a cancelled download is not shown as an error", async () => {
  vi.mocked(commands.ollamaPull).mockResolvedValue({
    status: "error",
    error: { kind: "provider", error: { kind: "cancelled" } },
  });
  await useModelsStore.getState().pullModel("a:1b");
  expect(useModelsStore.getState().pullError).toBeNull();
});
