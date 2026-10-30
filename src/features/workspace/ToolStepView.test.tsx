// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToolStepView } from "./ToolStepView";
import type { ToolStep } from "../chat/store";

afterEach(() => {
  cleanup();
});

describe("ToolStepView", () => {
  it("run card shows the exact command", () => {
    const onAnswer = vi.fn();
    const step: ToolStep = {
      id: 7,
      action: {
        tool: "runCommand",
        command: "npm test && del x",
        folder: "C:\\projects\\demo",
      },
      needsAnswer: true,
    };

    const { rerender } = render(<ToolStepView step={step} onAnswer={onAnswer} />);

    expect(screen.getByText("Run command")).toBeDefined();
    expect(screen.getByText("in C:\\projects\\demo")).toBeDefined();
    expect(screen.getByText("npm test && del x")).toBeDefined();

    const runBtn = screen.getByRole("button", { name: "Run" });
    const denyBtn = screen.getByRole("button", { name: "Deny" });

    fireEvent.click(runBtn);
    expect(onAnswer).toHaveBeenCalledWith(7, true);

    fireEvent.click(denyBtn);
    expect(onAnswer).toHaveBeenCalledWith(7, false);

    // Buttons gone once answered
    const answeredStep: ToolStep = {
      ...step,
      answered: true,
    };
    rerender(<ToolStepView step={answeredStep} onAnswer={onAnswer} />);

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  });

  it("command output renders as text", () => {
    const step: ToolStep = {
      id: 8,
      action: {
        tool: "runCommand",
        command: "echo test",
        folder: "C:\\test",
      },
      needsAnswer: false,
      outcome: {
        status: "command",
        exitCode: 0,
        output: "<b>x</b>",
        timedOut: false,
      },
    };

    const { container } = render(<ToolStepView step={step} />);

    expect(screen.getByText("<b>x</b>")).toBeDefined();
    expect(container.querySelector("b")).toBeNull();
  });
});
