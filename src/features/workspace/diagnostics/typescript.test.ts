// @vitest-environment jsdom

import ts from "typescript";
import { EditorState } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTypeScriptSyntax } from "./typescriptSyntax";

const parse = createTypeScriptSyntax(ts);
const error = (from: number, to: number, message: string) => ({
  from,
  to,
  severity: "error",
  message,
});

describe("TypeScript's parser", () => {
  it("reads the modern syntax the editor's grammar flags as errors", () => {
    const valid: [string, string][] = [
      ["a.ts", 'export { a, type B } from "x";\nexport type * as ns from "x";\n'],
      ["a.ts", "type F = (p: unknown) => p is string;\nconst h = (p: unknown): p is string => true;\n"],
      ["a.ts", 'declare module "m" { export const z: number; }\ntype T = typeof import("x");\n'],
      ["a.ts", 'interface V<in out T> {}\nlet t: [a: string, b?: number] = ["x"];\n'],
      ["a.ts", "type X<A> = A extends infer U extends string ? U : never;\n"],
      ["a.tsx", "const a = <div>{/* note */}{}</div>;\n"],
      ["a.js", 'import j from "./a.json" with { type: "json" };\nexport default class extends B {}\nconst h = 0XA;\n'],
      ["a.d.ts", "export declare function f(): void;\n"],
    ];
    for (const [name, text] of valid) expect(parse(name, text), text).toEqual([]);
  });

  it("reports mistakes with TypeScript's own messages", () => {
    expect(parse("a.ts", "let a = 1 2;\n")).toEqual([error(10, 11, "',' expected.")]);
    expect(parse("a.ts", "let s = 'abc\n")).toEqual([error(12, 12, "Unterminated string literal.")]);
    expect(parse("a.ts", "if (a) {\n")).toEqual([error(9, 9, "'}' expected.")]);
    expect(parse("a.js", "function f(a: string) {}\n")).toEqual([
      error(14, 20, "Type annotations can only be used in TypeScript files."),
    ]);
    expect(parse("a.tsx", "const a = <div>;\n")[0]).toEqual(
      error(11, 14, "JSX element 'div' has no corresponding closing tag."),
    );
  });
});

/** Stands in for the browser's Worker: answers with the real parser, a moment later. */
class FakeWorker {
  static made: FakeWorker[] = [];
  static failing = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(data: { id: number; filename: string; text: string }) {
    queueMicrotask(() => {
      if (FakeWorker.failing) this.onerror?.();
      else this.onmessage?.({ data: { id: data.id, problems: parse(data.filename, data.text) } });
    });
  }
  terminate() {
    this.terminated = true;
  }
}

describe("typescriptChecker", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.made = [];
    FakeWorker.failing = false;
    vi.stubGlobal("Worker", FakeWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const state = (doc: string) => EditorState.create({ doc });

  it("reads JavaScript and TypeScript files of every kind", async () => {
    const { typescriptChecker } = await import("./typescript");
    for (const f of ["a.js", "a.mjs", "a.cjs", "a.jsx", "a.ts", "a.mts", "a.cts", "a.tsx", "a.d.ts"]) {
      expect(typescriptChecker.appliesTo(f), f).toBe(true);
    }
    for (const f of ["a.json", "a.rs", "a.vue", "a.tsbuildinfo", "ts"]) {
      expect(typescriptChecker.appliesTo(f), f).toBe(false);
    }
  });

  it("checks in one worker, started on the first check", async () => {
    const { typescriptChecker } = await import("./typescript");
    expect(FakeWorker.made).toHaveLength(0);
    expect(await typescriptChecker.check(state("let a = 1 2;\n"), "a.ts")).toEqual([
      error(10, 11, "',' expected."),
    ]);
    expect(await typescriptChecker.check(state("let a = 1;\n"), "a.ts")).toEqual([]);
    expect(FakeWorker.made).toHaveLength(1);
  });

  it("lets the worker go after five idle minutes and starts a new one when needed", async () => {
    vi.useFakeTimers();
    const { typescriptChecker, IDLE_MS } = await import("./typescript");
    await typescriptChecker.check(state("let a = 1;\n"), "a.ts");
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(FakeWorker.made[0].terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(FakeWorker.made[0].terminated).toBe(true);

    await typescriptChecker.check(state("let a = 1;\n"), "a.ts");
    expect(FakeWorker.made).toHaveLength(2);
  });

  it("shows no problems, and stops trying, when the worker fails", async () => {
    FakeWorker.failing = true;
    const { typescriptChecker } = await import("./typescript");
    expect(await typescriptChecker.check(state("let a = 1 2;\n"), "a.ts")).toEqual([]);
    expect(await typescriptChecker.check(state("let a = 1 2;\n"), "a.ts")).toEqual([]);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].terminated).toBe(true);
  });

  it("shows no problems where there are no workers", async () => {
    vi.stubGlobal("Worker", undefined);
    const { typescriptChecker } = await import("./typescript");
    expect(await typescriptChecker.check(state("let a = 1 2;\n"), "a.ts")).toEqual([]);
  });
});
