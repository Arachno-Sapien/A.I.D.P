import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from "@tauri-apps/api/core";
import { commands } from "./bindings";

describe("generated IPC bindings", () => {
  it("stopReply calls stop_reply", async () => {
    await commands.stopReply();
    expect(invoke).toHaveBeenCalledWith("stop_reply");
  });
});
