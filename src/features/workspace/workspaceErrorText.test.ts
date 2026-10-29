import { describe, expect, it } from "vitest";
import type { WorkspaceError } from "../../lib/bindings";
import { workspaceErrorText } from "./workspaceErrorText";

describe("workspaceErrorText", () => {
  it("has copy for every error kind", () => {
    const errors: WorkspaceError[] = [
      { kind: "noFolder" },
      { kind: "outsideFolder" },
      { kind: "notFound" },
      { kind: "notText" },
      { kind: "tooLarge", bytes: 3000000 },
      { kind: "changedOnDisk" },
      { kind: "io", message: "disk error" },
      { kind: "storage", message: "db error" },
    ];

    for (const err of errors) {
      const text = workspaceErrorText(err);
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});
