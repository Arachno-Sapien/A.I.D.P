import { describe, expect, it } from "vitest";
import { applyProposal } from "./applyProposal";

describe("applyProposal", () => {
  it("replaces the whole file when selection is null", () => {
    const res = applyProposal("hello world", null, "goodbye world");
    expect(res).toEqual({ ok: true, text: "goodbye world" });
  });

  it("keeps a trailing newline when doc ends with one and code does not", () => {
    const withNewline = applyProposal("hello\n", null, "goodbye");
    expect(withNewline).toEqual({ ok: true, text: "goodbye\n" });

    const alreadyNewline = applyProposal("hello\n", null, "goodbye\n");
    expect(alreadyNewline).toEqual({ ok: true, text: "goodbye\n" });

    const withoutNewline = applyProposal("hello", null, "goodbye");
    expect(withoutNewline).toEqual({ ok: true, text: "goodbye" });
  });

  it("replaces the selection when it occurs exactly once", () => {
    const res = applyProposal("foo bar baz", "bar", "qux");
    expect(res).toEqual({ ok: true, text: "foo qux baz" });
  });

  it("returns selectionChanged when selection is not found", () => {
    const res = applyProposal("foo bar baz", "missing", "qux");
    expect(res).toEqual({ ok: false, reason: "selectionChanged" });
  });

  it("returns selectionAmbiguous when selection occurs more than once", () => {
    const res = applyProposal("foo bar bar baz", "bar", "qux");
    expect(res).toEqual({ ok: false, reason: "selectionAmbiguous" });
  });
});
