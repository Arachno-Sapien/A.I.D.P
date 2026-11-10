// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/bindings", () => ({ commands: {} }));

import { ReviewCard } from "./ReviewCard";
import { useWorkspaceStore } from "./store";

afterEach(() => cleanup());

describe("ReviewCard", () => {
  const undoReview = vi.fn();
  const undoAll = vi.fn();
  const keepReview = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    undoReview.mockResolvedValue(null);
    undoAll.mockResolvedValue(null);
    useWorkspaceStore.setState({
      review: [
        { path: "src/a.ts", original: "one\n", current: "two\n" },
        { path: "new.ts", original: null, current: "hi\n" },
      ],
      reviewDiff: null,
      undoReview,
      undoAll,
      keepReview,
    });
  });

  it("lists every changed file, edited or new", () => {
    render(<ReviewCard />);
    expect(screen.getByText("The agent changed 2 files")).toBeTruthy();
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("edited")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
  });

  it("shows a file's diff", () => {
    render(<ReviewCard />);
    fireEvent.click(screen.getByRole("button", { name: "Show changes to src/a.ts" }));
    expect(useWorkspaceStore.getState().reviewDiff).toBe("src/a.ts");
  });

  it("undoes one file, or all, and shows what was refused", async () => {
    undoReview.mockResolvedValueOnce(
      "src/a.ts changed after the agent wrote it, so it was left as it is.",
    );
    render(<ReviewCard />);
    fireEvent.click(screen.getByRole("button", { name: "Undo src/a.ts" }));
    expect(undoReview).toHaveBeenCalledWith("src/a.ts");
    expect(await screen.findByText(/changed after the agent wrote it/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo all" }));
    expect(undoAll).toHaveBeenCalled();
  });

  it("Keep all ends the review", () => {
    render(<ReviewCard />);
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    expect(keepReview).toHaveBeenCalled();
  });

  it("shows nothing with no changes", () => {
    useWorkspaceStore.setState({ review: [] });
    const { container } = render(<ReviewCard />);
    expect(container.textContent).toBe("");
  });
});
