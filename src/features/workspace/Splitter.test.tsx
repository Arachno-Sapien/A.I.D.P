// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampWidth, Splitter } from "./Splitter";

describe("Splitter", () => {
  afterEach(() => {
    cleanup();
  });

  it("clamps widths", () => {
    expect(clampWidth(50, 160, 600)).toBe(160);
    expect(clampWidth(700, 160, 600)).toBe(600);
    expect(clampWidth(300.4, 160, 600)).toBe(300);
    // A window too narrow to leave any room keeps the panel at its minimum.
    expect(clampWidth(300, 160, -40)).toBe(160);
  });

  it("resizes with the keyboard", () => {
    const onChange = vi.fn();
    render(
      <Splitter
        label="Resize file tree"
        width={280}
        min={160}
        max={() => 600}
        grow={1}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    const bar = screen.getByRole("separator", { name: "Resize file tree" });

    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(296);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(264);
    fireEvent.keyDown(bar, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(160);
    fireEvent.keyDown(bar, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(600);
  });

  it("drags the panel wider in its own direction", () => {
    // A right-hand panel widens when its edge is dragged to the left.
    const onChange = vi.fn();
    render(
      <Splitter
        label="Resize AI panel"
        width={380}
        min={280}
        max={() => 700}
        grow={-1}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    const bar = screen.getByRole("separator", { name: "Resize AI panel" });

    fireEvent.pointerDown(bar, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 450, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(430);
    fireEvent.pointerMove(bar, { clientX: 900, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(280);

    fireEvent.pointerUp(bar, { pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 100, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("resets on double-click", () => {
    const onReset = vi.fn();
    render(
      <Splitter
        label="Resize file tree"
        width={500}
        min={160}
        max={() => 600}
        grow={1}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("separator", { name: "Resize file tree" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
