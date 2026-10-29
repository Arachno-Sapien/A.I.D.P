// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});

