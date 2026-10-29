import { describe, expect, it } from "vitest";
import {
  buildContent,
  chipsFor,
  fenceFor,
  FILE_CHAR_LIMIT,
  WORKSPACE_SYSTEM,
} from "./context";
import type { Tab } from "./store";

describe("context", () => {
  it("puts file, selection, then question", () => {
    const content = buildContent("How do I change this?", {
      file: { path: "src/a.ts", text: "line 1\nline 2" },
      selection: { path: "src/a.ts", text: "line 2", fromLine: 2, toLine: 2 },
    });

    expect(content).toBe(
      "File src/a.ts:\n```ts\nline 1\nline 2\n```\n\nSelected lines 2-2 of src/a.ts:\n```ts\nline 2\n```\n\nHow do I change this?",
    );
    expect(WORKSPACE_SYSTEM).toContain("assistant inside the user's code editor");
  });

  it("lengthens the fence around backticks", () => {
    expect(fenceFor('const s = "```";')).toBe("````");

    const content = buildContent("Explain this code", {
      file: { path: "src/a.ts", text: 'const s = "```";' },
    });

    expect(content).toBe(
      'File src/a.ts:\n````ts\nconst s = "```";\n````\n\nExplain this code',
    );
  });

  it("secret files start without the file chip", () => {
    const envTab: Tab = {
      path: ".env",
      name: ".env",
      version: "v1",
      lineEnding: "lf",
      hasBom: false,
      isSecret: true,
      dirty: false,
    };
    const mockBuffers = {
      text: () => "SECRET=123",
      selection: () => null,
    };
    const chips = chipsFor(envTab, mockBuffers);

    expect(chips.file).toBeDefined();
    expect(chips.file?.enabled).toBe(false);
    expect(chips.file?.reason).toBe("secret");
    expect(chips.selection).toBeNull();
  });

  it("too-large files cannot be attached", () => {
    const bigTab: Tab = {
      path: "large.ts",
      name: "large.ts",
      version: "v1",
      lineEnding: "lf",
      hasBom: false,
      isSecret: false,
      dirty: false,
    };
    const mockBuffers = {
      text: () => "a".repeat(FILE_CHAR_LIMIT + 1),
      selection: () => null,
    };
    const chips = chipsFor(bigTab, mockBuffers);

    expect(chips.file?.enabled).toBe(false);
    expect(chips.file?.reason).toBe("tooLarge");
  });
});
