import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn().mockResolvedValue(undefined),
  Channel: class {
    onmessage = vi.fn();
  },
}));

import { invoke, Channel } from "@tauri-apps/api/core";
import { commands } from "./bindings";

describe("generated IPC bindings", () => {
  it("stopReply calls stop_reply", async () => {
    await commands.stopReply();
    expect(invoke).toHaveBeenCalledWith("stop_reply");
  });

  it("addConnection sends the typed input to add_connection", async () => {
    await commands.addConnection({
      kind: "openaiCompat",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-x",
    });
    expect(invoke).toHaveBeenCalledWith("add_connection", {
      input: {
        kind: "openaiCompat",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-x",
      },
    });
  });

  it("sendMessage sends the connection and model ids", async () => {
    const channel = new Channel();
    await commands.sendMessage(1, "m", [], channel);
    expect(invoke).toHaveBeenCalledWith(
      "send_message",
      expect.objectContaining({
        connectionId: 1,
        modelId: "m",
      })
    );
  });

  it("replaceKey sends the id and key", async () => {
    await commands.replaceKey(1, "sk-new");
    expect(invoke).toHaveBeenCalledWith("replace_key", {
      id: 1,
      apiKey: "sk-new",
    });
  });
});
