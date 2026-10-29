import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn().mockResolvedValue("Hello, Ada!"),
}));

import { invoke } from "@tauri-apps/api/core";
import { commands } from "./bindings";

describe("generated IPC bindings", () => {
  it("greet calls the Rust command by name with its args", async () => {
    await expect(commands.greet("Ada")).resolves.toBe("Hello, Ada!");
    expect(invoke).toHaveBeenCalledWith("greet", { name: "Ada" });
  });
});
