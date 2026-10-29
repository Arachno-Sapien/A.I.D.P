// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    setUnsaved: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { buffers } from "./buffers";
import { createState } from "./cm";
import { EditorPane } from "./EditorPane";
import { useWorkspaceStore } from "./store";

describe("EditorPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buffers.clear();
    useWorkspaceStore.setState({
      tabs: [],
      active: null,
      conflict: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("tabs render dirty dots, clicking close on a dirty tab asks to discard", () => {
    const stateA = createState("const a = 1;", "a.ts");
    buffers.set("a.ts", stateA);

    useWorkspaceStore.setState({
      tabs: [
        {
          path: "a.ts",
          name: "a.ts",
          version: "v1",
          lineEnding: "lf",
          hasBom: false,
          isSecret: false,
          dirty: true,
        },
      ],
      active: "a.ts",
    });

    render(<EditorPane />);

    // Check dirty indicator dot
    expect(screen.getByTestId("dirty-dot-a.ts")).toBeDefined();

    // Click close on dirty tab
    const closeBtn = screen.getByRole("button", { name: "Close a.ts" });
    fireEvent.click(closeBtn);

    // Prompt to discard changes appears
    expect(screen.getByText("Discard unsaved changes?")).toBeDefined();

    // Clicking Discard removes tab
    const discardBtn = screen.getByRole("button", { name: "Discard" });
    fireEvent.click(discardBtn);

    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
  });

  const file = (path: string, text: string, version = "v1") => ({
    status: "ok" as const,
    data: {
      path,
      text,
      version,
      lineEnding: "lf" as const,
      hasBom: false,
      isSecret: false,
    },
  });

  it("shows the new text after a reload", async () => {
    vi.mocked(commands.readFile)
      .mockResolvedValueOnce(file("a.ts", "old"))
      .mockResolvedValueOnce(file("a.ts", "new", "v2"));
    await useWorkspaceStore.getState().openFile("a.ts");

    const { container } = render(<EditorPane />);
    expect(container.querySelector(".cm-content")?.textContent).toBe("old");

    await act(async () => {
      await useWorkspaceStore.getState().reload("a.ts");
    });
    expect(container.querySelector(".cm-content")?.textContent).toBe("new");
  });

  it("shows a newly opened file after the last tab was closed", async () => {
    vi.mocked(commands.readFile).mockImplementation(async (p) => file(p, p));
    await useWorkspaceStore.getState().openFile("a.ts");
    const { container } = render(<EditorPane />);

    act(() => {
      useWorkspaceStore.getState().closeTab("a.ts");
    });
    await act(async () => {
      await useWorkspaceStore.getState().openFile("b.ts");
    });

    expect(container.querySelector(".cm-content")?.textContent).toBe("b.ts");
  });
});

