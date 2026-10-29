// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffView } from "./DiffView";
import { useWorkspaceStore } from "./store";

vi.mock("./cm", () => ({
  mountDiff: vi.fn(() => ({
    dom: document.createElement("div"),
    destroy: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
});

describe("DiffView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      proposal: {
        path: "src/a.ts",
        original: "const a = 1;",
        proposed: "const a = 2;",
      },
      needsGitConfirm: false,
    });
  });

  it("Accept and Reject call the store", () => {
    const acceptProposal = vi.fn();
    const rejectProposal = vi.fn();
    useWorkspaceStore.setState({ acceptProposal, rejectProposal });

    render(<DiffView />);

    expect(screen.getByText("src/a.ts")).toBeDefined();

    const acceptBtn = screen.getByRole("button", { name: /^accept$/i });
    fireEvent.click(acceptBtn);
    expect(acceptProposal).toHaveBeenCalled();

    const rejectBtn = screen.getByRole("button", { name: /^reject$/i });
    fireEvent.click(rejectBtn);
    expect(rejectProposal).toHaveBeenCalled();
  });

  it("shows git confirmation when needsGitConfirm is true", () => {
    const confirmGit = vi.fn();
    useWorkspaceStore.setState({
      needsGitConfirm: true,
      confirmGit,
    });

    render(<DiffView />);

    expect(
      screen.getByText(/This folder isn't a git repository/i),
    ).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: /accept anyway/i });
    fireEvent.click(confirmBtn);
    expect(confirmGit).toHaveBeenCalled();
  });
});
