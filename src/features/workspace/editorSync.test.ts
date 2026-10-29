// @vitest-environment jsdom
// Types into a real CodeMirror view. The component tests do not, which is how
// edits that never reached the store's buffers once got past the whole suite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    setUnsaved: vi.fn().mockResolvedValue(undefined),
  },
}));

import type { EditorView } from "@codemirror/view";
import { commands } from "../../lib/bindings";
import { buffers } from "./buffers";
import { mountView } from "./cm";
import { useWorkspaceStore } from "./store";

const file = (path: string, text: string) => ({
  status: "ok" as const,
  data: {
    path,
    text,
    version: "v1",
    lineEnding: "lf" as const,
    hasBom: false,
    isSecret: false,
  },
});

let view: EditorView | null = null;
function mount(path: string): EditorView {
  const state = buffers.get(path);
  if (!state) throw new Error(`no buffer for ${path}`);
  view = mountView(document.createElement("div"), state);
  return view;
}

describe("the editor and the store stay in sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buffers.clear();
    useWorkspaceStore.setState({
      tabs: [],
      active: null,
      conflict: null,
      selection: null,
    });
  });

  afterEach(() => {
    view?.destroy();
    view = null;
  });

  it("typing reaches the buffer, marks the tab dirty, and Save writes it", async () => {
    vi.mocked(commands.readFile).mockResolvedValue(file("a.ts", "one\n"));
    vi.mocked(commands.writeFile).mockResolvedValue({ status: "ok", data: "v2" });
    await useWorkspaceStore.getState().openFile("a.ts");
    const v = mount("a.ts");

    v.dispatch({ changes: { from: 0, insert: "zero " } });

    expect(buffers.text("a.ts")).toBe("zero one\n");
    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(true);
    expect(commands.setUnsaved).toHaveBeenLastCalledWith(true);

    await useWorkspaceStore.getState().save("a.ts");
    expect(vi.mocked(commands.writeFile).mock.calls[0]?.[0].text).toBe(
      "zero one\n",
    );
    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(false);
  });

  it("tells Rust about unsaved work only when it changes", async () => {
    vi.mocked(commands.readFile).mockResolvedValue(file("a.ts", "one\n"));
    await useWorkspaceStore.getState().openFile("a.ts");
    const v = mount("a.ts");
    vi.mocked(commands.setUnsaved).mockClear();

    v.dispatch({ changes: { from: 0, insert: "a" } });
    v.dispatch({ changes: { from: 0, insert: "b" } });
    v.dispatch({ changes: { from: 0, insert: "c" } });

    expect(commands.setUnsaved).toHaveBeenCalledTimes(1);
    expect(commands.setUnsaved).toHaveBeenCalledWith(true);
  });

  it("an edit typed while saving stays unsaved", async () => {
    vi.mocked(commands.readFile).mockResolvedValue(file("a.ts", "one\n"));
    let finish: (r: { status: "ok"; data: string }) => void = () => {};
    vi.mocked(commands.writeFile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await useWorkspaceStore.getState().openFile("a.ts");
    const v = mount("a.ts");

    v.dispatch({ changes: { from: 0, insert: "x" } });
    const saving = useWorkspaceStore.getState().save("a.ts");
    v.dispatch({ changes: { from: 0, insert: "y" } });
    finish({ status: "ok", data: "v2" });
    await saving;

    expect(vi.mocked(commands.writeFile).mock.calls[0]?.[0].text).toBe("xone\n");
    expect(useWorkspaceStore.getState().tabs[0]?.dirty).toBe(true);
  });

  it("edits survive switching tabs", async () => {
    vi.mocked(commands.readFile).mockImplementation(async (p) =>
      file(p, `${p}\n`),
    );
    await useWorkspaceStore.getState().openFile("a.ts");
    await useWorkspaceStore.getState().openFile("b.ts");
    const v = mount("a.ts");

    v.dispatch({ changes: { from: 0, insert: "edited " } });
    v.setState(buffers.get("b.ts")!);
    v.setState(buffers.get("a.ts")!);

    expect(v.state.doc.toString()).toBe("edited a.ts\n");
  });

  it("the selection reaches the store", async () => {
    vi.mocked(commands.readFile).mockResolvedValue(
      file("a.ts", "one\ntwo\nthree\n"),
    );
    await useWorkspaceStore.getState().openFile("a.ts");
    const v = mount("a.ts");

    v.dispatch({ selection: { anchor: 4, head: 13 } });

    expect(useWorkspaceStore.getState().selection).toEqual({
      path: "a.ts",
      info: { text: "two\nthree", fromLine: 2, toLine: 3 },
    });
  });
});
