// @vitest-environment jsdom

import { diagnosticCount, forceLinting } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createState, loadLanguage, mountView } from "../cm";
import { checkerFor } from "./index";

async function problems(filename: string, doc: string) {
  await loadLanguage(filename);
  const checker = checkerFor(filename);
  if (!checker) throw new Error(`no checker for ${filename}`);
  return checker.check(createState(doc, filename), filename);
}

const error = (from: number, to: number, message: string) => ({
  from,
  to,
  severity: "error",
  message,
});

describe("checkerFor", () => {
  it("checks the languages whose grammar reads real code without false errors", () => {
    for (const f of ["main.rs", "package.json", "ci.yml", "a.yaml", "pom.xml"]) {
      expect(checkerFor(f)?.name, f).toBe("Syntax");
    }
  });

  it("sends JavaScript and TypeScript to TypeScript's own parser", () => {
    for (const f of ["a.js", "a.mjs", "a.jsx", "a.ts", "a.tsx", "vite.config.mts", "a.d.ts"]) {
      expect(checkerFor(f)?.name, f).toBe("TypeScript");
    }
  });

  it("skips languages whose grammar misreads valid code, and plain text", () => {
    for (const f of ["a.py", "a.css", "a.html", "a.c", "a.cpp", "a.md", "notes.txt", "Makefile"]) {
      expect(checkerFor(f), f).toBeUndefined();
    }
  });

  it("skips JSON files that allow comments", () => {
    for (const f of ["tsconfig.json", "tsconfig.node.json", "jsconfig.json", "settings.json", ".eslintrc.json", "a.jsonc"]) {
      expect(checkerFor(f), f).toBeUndefined();
    }
  });
});

describe("syntax checker", () => {
  it("underlines the token where the parser got stuck", async () => {
    expect(await problems("a.rs", "fn main() { let x = 1 2; }\n")).toEqual([
      error(22, 23, 'Unexpected "2"'),
    ]);
    expect(await problems("a.json", '{"a": 1}}\n')).toEqual([error(8, 9, 'Unexpected "}"')]);
  });

  it("underlines text the parser skipped", async () => {
    expect(await problems("a.rs", "fn a() {}\n}\n")).toEqual([error(10, 11, 'Unexpected "}"')]);
    expect(await problems("a.json", "[1 2]\n")).toEqual([error(3, 4, 'Unexpected "2"')]);
  });

  it("says when the file ends with something left open, once", async () => {
    expect(await problems("a.rs", "fn f( {\n")).toEqual([
      error(6, 7, 'Unexpected "{"'),
      error(8, 8, "Unexpected end of file"),
    ]);
    expect(await problems("a.yaml", "a: [1, 2\n")).toEqual([error(9, 9, "Unexpected end of file")]);
  });

  it("finds XML tags that don't match", async () => {
    expect(await problems("a.xml", "<a><b></a>\n")).toEqual([error(3, 6, '"<b>" is never closed')]);
    expect(await problems("a.xml", "<a></b></a>\n")).toEqual([
      error(3, 7, '"</b>" has no matching open tag'),
    ]);
  });

  it("finds nothing in valid code", async () => {
    const valid: [string, string][] = [
      ["a.rs", "#[derive(Debug)]\npub struct P<'a> { name: &'a str }\n\nimpl P<'_> {\n    pub fn get(&self) -> Option<&str> { Some(self.name) }\n}\n\nmacro_rules! sq { ($x:expr) => { $x * $x }; }\n"],
      ["package.json", '{ "name": "x", "version": "1.0.0", "list": [1, 2.5e3, true, null], "o": {} }\n'],
      ["ci.yml", "name: CI\non: [push]\njobs:\n  test:\n    steps:\n      - run: |\n          npm test\n"],
      ["pom.xml", '<?xml version="1.0"?>\n<!-- note -->\n<a x="1"><b/><![CDATA[ < ]]></a>\n'],
    ];
    for (const [name, doc] of valid) expect(await problems(name, doc), name).toEqual([]);
  });
});

// Under the full parallel run a check of 150 lines in jsdom can take over a second.
const WAIT = { timeout: 5000 };

describe("in the editor", () => {
  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    view = null;
  });

  async function open(filename: string, doc: string) {
    await loadLanguage(filename);
    view = mountView(document.body, createState(doc, filename));
    forceLinting(view);
    return view;
  }

  it("underlines a problem, names its checker and counts it below the editor", async () => {
    const v = await open("main.rs", "fn main() { let x = 1 2; }\n");
    await vi.waitFor(() => expect(diagnosticCount(v.state)).toBe(1), WAIT);
    expect(v.dom.querySelector(".cm-lintRange-error")?.textContent).toBe("2");
    const count = v.dom.querySelector<HTMLButtonElement>(".cm-problem-count button");
    expect(count?.textContent).toBe("1 problem");

    count?.click();
    expect(v.dom.querySelector(".cm-panel-lint")?.textContent).toContain('Unexpected "2"');
    expect(v.dom.querySelector(".cm-panel-lint")?.textContent).toContain("Syntax");
  });

  it("drops the count once the mistake is fixed", async () => {
    const v = await open("main.rs", "fn main() { let x = 1 2; }\n");
    await vi.waitFor(() => expect(diagnosticCount(v.state)).toBe(1), WAIT);
    v.dispatch({ changes: { from: 21, to: 23, insert: "" } });
    forceLinting(v);
    await vi.waitFor(() => expect(diagnosticCount(v.state)).toBe(0), WAIT);
    expect(v.dom.querySelector(".cm-problem-count button")?.textContent).toBe("No problems");
  });

  it("shows at most 100 problems", async () => {
    const v = await open("main.rs", "fn main() { let x = ; }\n".repeat(150));
    await vi.waitFor(() => expect(diagnosticCount(v.state)).toBe(100), WAIT);
    expect(v.dom.querySelector(".cm-problem-count button")?.textContent).toBe("100+ problems");
  });

  it("leaves files without a checker alone", async () => {
    const v = await open("a.py", "def f(:\n");
    await new Promise((r) => setTimeout(r, 0));
    expect(diagnosticCount(v.state)).toBe(0);
    expect(v.dom.querySelector(".cm-problem-count")).toBeNull();
  });
});
