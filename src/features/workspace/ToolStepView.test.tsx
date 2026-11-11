// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToolStepView } from "./ToolStepView";
import type { ToolStep } from "../chat/store";

vi.mock("../../lib/bindings", () => ({
  commands: { allowCommand: vi.fn().mockResolvedValue({ status: "ok", data: null }) },
}));
import { commands } from "../../lib/bindings";

afterEach(() => {
  cleanup();
});

describe("ToolStepView", () => {
  it("Always allow remembers the command, then runs it", async () => {
    const onAnswer = vi.fn();
    const step: ToolStep = {
      id: 9,
      action: { tool: "runCommand", command: "npm test", folder: "C:\p" },
      needsAnswer: true,
    };
    render(<ToolStepView step={step} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    await vi.waitFor(() => expect(onAnswer).toHaveBeenCalledWith(9, true));
    expect(commands.allowCommand).toHaveBeenCalledWith("npm test");
  });

  it("a start server card asks like a command and shows where it runs", async () => {
    const onAnswer = vi.fn();
    const step: ToolStep = {
      id: 11,
      action: { tool: "startServer", command: "npm run dev", folder: "C:/p" },
      needsAnswer: true,
    };
    const { rerender } = render(<ToolStepView step={step} onAnswer={onAnswer} />);
    expect(screen.getByText("Start server")).toBeDefined();
    expect(screen.getByText("npm run dev")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    await vi.waitFor(() => expect(onAnswer).toHaveBeenCalledWith(11, true));
    expect(commands.allowCommand).toHaveBeenCalledWith("npm run dev");

    rerender(
      <ToolStepView
        step={{ ...step, answered: true, outcome: { status: "server", server: 2, output: "http://localhost:5173" } }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("Server 2: its output is in a terminal tab")).toBeDefined();
    expect(screen.getByText("http://localhost:5173")).toBeDefined();
  });

  it("labels server output and stop steps", () => {
    render(<ToolStepView step={{ id: 12, action: { tool: "serverOutput", server: 2 }, needsAnswer: false }} />);
    expect(screen.getByText("Read server 2 output")).toBeDefined();
    cleanup();
    render(<ToolStepView step={{ id: 13, action: { tool: "stopServer", server: 2 }, needsAnswer: false }} />);
    expect(screen.getByText("Stop server 2")).toBeDefined();
  });

  it("an outside tool card has no Always allow", () => {
    const step: ToolStep = {
      id: 10,
      action: { tool: "mcpTool", server: "browser", name: "browser_click", arguments: "{}" },
      needsAnswer: true,
    };
    render(<ToolStepView step={step} onAnswer={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Always allow" })).toBeNull();
  });

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

    // The command stays on the card once answered and once it has run, so
    // the history shows what ran.
    expect(screen.getByText("npm test && del x")).toBeDefined();
    rerender(
      <ToolStepView
        step={{
          ...answeredStep,
          outcome: { status: "command", exitCode: 1, output: "", timedOut: false },
        }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("npm test && del x")).toBeDefined();
    expect(screen.getByText("in C:\\projects\\demo")).toBeDefined();
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

  it("a missing exit code is not shown as success", () => {
    const step: ToolStep = {
      id: 9,
      action: { tool: "runCommand", command: "x", folder: "C:\\test" },
      needsAnswer: false,
      outcome: { status: "command", exitCode: null, output: "", timedOut: false },
    };

    render(<ToolStepView step={step} />);

    expect(screen.getByText("Exit code unknown")).toBeDefined();
    expect(screen.queryByText("Exit code 0")).toBeNull();
  });

  it("an outside tool call shows the server, the tool and the arguments, and asks", () => {
    const onAnswer = vi.fn();
    const args = '{\n  "url": "http://localhost:5173"\n}';
    const step: ToolStep = {
      id: 10,
      action: {
        tool: "mcpTool",
        server: "browser",
        name: "browser_navigate",
        arguments: args,
      },
      needsAnswer: true,
    };

    const { container } = render(
      <ToolStepView step={step} onAnswer={onAnswer} />,
    );

    expect(screen.getByText("browser: browser_navigate")).toBeDefined();
    expect(
      screen.getByText("Outside tool. This is sent to browser:"),
    ).toBeDefined();
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toBe(args);

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onAnswer).toHaveBeenCalledWith(10, true);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onAnswer).toHaveBeenCalledWith(10, false);
  });

  it("the arguments stay after the answer", () => {
    const args = '{\n  "url": "http://localhost:5173"\n}';
    const step: ToolStep = {
      id: 11,
      action: {
        tool: "mcpTool",
        server: "browser",
        name: "browser_navigate",
        arguments: args,
      },
      needsAnswer: true,
      answered: true,
      outcome: { status: "text", output: "Page title: Home" },
    };

    const { container } = render(<ToolStepView step={step} />);

    const pres = Array.from(container.querySelectorAll("pre")).map(
      (p) => p.textContent,
    );
    expect(pres).toContain(args);
    expect(pres).toContain("Page title: Home");
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  });

  it("starting outside tools is labelled", () => {
    const step: ToolStep = {
      id: 12,
      action: { tool: "mcpStart", server: "browser" },
      needsAnswer: false,
      outcome: { status: "ok", summary: "24 tools" },
    };

    render(<ToolStepView step={step} />);

    expect(screen.getByText("Start outside tools: browser")).toBeDefined();
    expect(screen.getByText("24 tools")).toBeDefined();
  });
});
