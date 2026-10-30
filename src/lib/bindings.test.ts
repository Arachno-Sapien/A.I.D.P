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
    await commands.stopReply("chat");
    expect(invoke).toHaveBeenCalledWith("stop_reply", { surface: "chat" });
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
    await commands.sendMessage("chat", 1, "m", [], channel);
    expect(invoke).toHaveBeenCalledWith(
      "send_message",
      expect.objectContaining({
        surface: "chat",
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

  it("openFolder calls open_folder", async () => {
    await commands.openFolder();
    expect(invoke).toHaveBeenCalledWith("open_folder");
  });

  it("recentFolders calls recent_folders", async () => {
    await commands.recentFolders();
    expect(invoke).toHaveBeenCalledWith("recent_folders");
  });

  it("openRecent sends path to open_recent", async () => {
    await commands.openRecent("/path/to/folder");
    expect(invoke).toHaveBeenCalledWith("open_recent", {
      path: "/path/to/folder",
    });
  });

  it("closeFolder calls close_folder", async () => {
    await commands.closeFolder();
    expect(invoke).toHaveBeenCalledWith("close_folder");
  });

  it("listDir sends path to list_dir", async () => {
    await commands.listDir("src");
    expect(invoke).toHaveBeenCalledWith("list_dir", { path: "src" });
  });

  it("readFile sends path to read_file", async () => {
    await commands.readFile("src/a.ts");
    expect(invoke).toHaveBeenCalledWith("read_file", { path: "src/a.ts" });
  });

  it("writeFile sends req to write_file", async () => {
    await commands.writeFile({
      path: "src/a.ts",
      text: "hello",
      lineEnding: "lf",
      hasBom: false,
      expectedVersion: "1-5",
    });
    expect(invoke).toHaveBeenCalledWith("write_file", {
      req: {
        path: "src/a.ts",
        text: "hello",
        lineEnding: "lf",
        hasBom: false,
        expectedVersion: "1-5",
      },
    });
  });

  it("runAgent sends connectionId, modelId, messages, onEvent", async () => {
    const channel = new Channel();
    await commands.runAgent(1, "model-x", [], channel);
    expect(invoke).toHaveBeenCalledWith("run_agent", {
      connectionId: 1,
      modelId: "model-x",
      messages: [],
      onEvent: channel,
    });
  });

  it("answerTool sends id and approve", async () => {
    await commands.answerTool(42, true);
    expect(invoke).toHaveBeenCalledWith("answer_tool", {
      id: 42,
      approve: true,
    });
  });

  it("terminalOpen sends cols, rows, and onEvent", async () => {
    const channel = new Channel();
    await commands.terminalOpen(80, 24, channel as any);
    expect(invoke).toHaveBeenCalledWith("terminal_open", {
      cols: 80,
      rows: 24,
      onEvent: channel,
    });
  });

  it("terminalWrite sends data", async () => {
    await commands.terminalWrite("ls\n");
    expect(invoke).toHaveBeenCalledWith("terminal_write", { data: "ls\n" });
  });

  it("terminalResize sends cols and rows", async () => {
    await commands.terminalResize(100, 30);
    expect(invoke).toHaveBeenCalledWith("terminal_resize", {
      cols: 100,
      rows: 30,
    });
  });

  it("terminalClose calls terminal_close", async () => {
    await commands.terminalClose();
    expect(invoke).toHaveBeenCalledWith("terminal_close");
  });
});
