// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listMcpServers: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    addMcpServer: vi.fn(),
    setMcpServerEnabled: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    setMcpServerAutoApprove: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    deleteMcpServer: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    testMcpServer: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { BROWSER_PRESET, OutsideTools } from "./OutsideTools";

describe("OutsideTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lists servers with their state", async () => {
    vi.mocked(commands.listMcpServers).mockResolvedValueOnce({
      status: "ok",
      data: [
        { id: 1, name: "browser", command: "npx browser", enabled: true, autoApprove: false },
        { id: 2, name: "docs", command: "node docs.js", enabled: false, autoApprove: false },
      ],
    });

    render(<OutsideTools />);

    expect(await screen.findByText("browser")).toBeDefined();
    expect(screen.getByText("npx browser")).toBeDefined();
    expect(screen.getByText("docs")).toBeDefined();
    expect(screen.getByText("node docs.js")).toBeDefined();

    const bCheck = screen.getByRole("checkbox", {
      name: "browser on",
    }) as HTMLInputElement;
    const dCheck = screen.getByRole("checkbox", {
      name: "docs on",
    }) as HTMLInputElement;
    expect(bCheck.checked).toBe(true);
    expect(dCheck.checked).toBe(false);
  });

  it("an empty list says so", async () => {
    render(<OutsideTools />);
    expect(await screen.findByText("No outside tools yet.")).toBeDefined();
  });

  it("the preset fills the form and adds nothing", async () => {
    render(<OutsideTools />);
    await screen.findByText("No outside tools yet.");

    fireEvent.click(
      screen.getByRole("button", { name: "Fill in Browser checks (Playwright)" }),
    );

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const commandInput = screen.getByLabelText("Command") as HTMLInputElement;
    expect(nameInput.value).toBe("browser");
    expect(commandInput.value).toBe(BROWSER_PRESET.command);
    expect(commands.addMcpServer).not.toHaveBeenCalled();
  });

  it("Add sends the fields and reloads", async () => {
    vi.mocked(commands.addMcpServer).mockResolvedValueOnce({
      status: "ok",
      data: { id: 3, name: "docs", command: "node server.js", enabled: true, autoApprove: false },
    });

    render(<OutsideTools />);
    await screen.findByText("No outside tools yet.");

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const commandInput = screen.getByLabelText("Command") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "docs" } });
    fireEvent.change(commandInput, { target: { value: "node server.js" } });

    vi.mocked(commands.listMcpServers).mockResolvedValueOnce({
      status: "ok",
      data: [{ id: 3, name: "docs", command: "node server.js", enabled: true, autoApprove: false }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(commands.addMcpServer).toHaveBeenCalledTimes(1);
      expect(commands.addMcpServer).toHaveBeenCalledWith(
        "docs",
        "node server.js",
      );
    });
    expect(await screen.findByText("docs")).toBeDefined();
    expect(nameInput.value).toBe("");
    expect(commandInput.value).toBe("");
  });

  it("a refused add shows Rust's message and keeps the fields", async () => {
    vi.mocked(commands.addMcpServer).mockResolvedValueOnce({
      status: "error",
      error: {
        kind: "invalidInput",
        message: "A server with that name already exists.",
      },
    });

    render(<OutsideTools />);
    await screen.findByText("No outside tools yet.");

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const commandInput = screen.getByLabelText("Command") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "browser" } });
    fireEvent.change(commandInput, { target: { value: "npx x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("A server with that name already exists."),
    ).toBeDefined();
    expect(nameInput.value).toBe("browser");
    expect(commandInput.value).toBe("npx x");
  });

  it("the switch turns a server off", async () => {
    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [{ id: 1, name: "browser", command: "npx x", enabled: true, autoApprove: false }],
    });

    render(<OutsideTools />);
    const checkbox = (await screen.findByRole("checkbox", {
      name: "browser on",
    })) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(commands.setMcpServerEnabled).toHaveBeenCalledWith(1, false);
    });
  });

  it("Run without asking is confirmed before it turns on, not before it turns off", async () => {
    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [{ id: 1, name: "browser", command: "npx x", enabled: true, autoApprove: false }],
    });

    render(<OutsideTools />);
    const box = (await screen.findByRole("checkbox", {
      name: "browser runs without asking",
    })) as HTMLInputElement;
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Let browser run without asking?")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(commands.setMcpServerAutoApprove).not.toHaveBeenCalled();

    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [{ id: 1, name: "browser", command: "npx x", enabled: true, autoApprove: true }],
    });
    fireEvent.click(box);
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run without asking" }));
    await waitFor(() => {
      expect(commands.setMcpServerAutoApprove).toHaveBeenCalledWith(1, true);
    });

    const onBox = (await screen.findByRole("checkbox", {
      name: "browser runs without asking",
    })) as HTMLInputElement;
    await waitFor(() => expect(onBox.checked).toBe(true));
    fireEvent.click(onBox);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(commands.setMcpServerAutoApprove).toHaveBeenCalledWith(1, false);
    });
  });

  it("Remove asks first", async () => {
    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [{ id: 5, name: "browser", command: "npx x", enabled: true, autoApprove: false }],
    });

    render(<OutsideTools />);
    const removeBtn = await screen.findByRole("button", {
      name: "Remove browser",
    });
    fireEvent.click(removeBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Remove browser?")).toBeDefined();
    expect(
      within(dialog).getByText("The agent will no longer have its tools."),
    ).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(commands.deleteMcpServer).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove browser" }));
    const dialog2 = screen.getByRole("dialog");
    fireEvent.click(within(dialog2).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(commands.deleteMcpServer).toHaveBeenCalledWith(5);
    });
  });

  it("Test shows the tools, or the error", async () => {
    vi.mocked(commands.listMcpServers).mockResolvedValue({
      status: "ok",
      data: [{ id: 1, name: "fake", command: "node fake.js", enabled: true, autoApprove: false }],
    });

    let resolveTest!: (v: { status: "ok"; data: string[] }) => void;
    vi.mocked(commands.testMcpServer).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveTest = r;
        }),
    );

    render(<OutsideTools />);
    const testBtn = (await screen.findByRole("button", {
      name: "Test fake",
    })) as HTMLButtonElement;
    fireEvent.click(testBtn);

    expect(await screen.findByText("Starting…")).toBeDefined();
    expect(testBtn.disabled).toBe(true);
    // Removing or turning it off mid-start is held until the start ends.
    const onBox = screen.getByRole("checkbox", { name: "fake on" }) as HTMLInputElement;
    const removeBtn = screen.getByRole("button", { name: "Remove fake" }) as HTMLButtonElement;
    expect(onBox.disabled).toBe(true);
    expect(removeBtn.disabled).toBe(true);

    resolveTest({ status: "ok", data: ["echo", "slow"] });
    expect(await screen.findByText("2 tools: echo, slow")).toBeDefined();
    expect(testBtn.disabled).toBe(false);
    expect(onBox.disabled).toBe(false);
    expect(removeBtn.disabled).toBe(false);

    vi.mocked(commands.testMcpServer).mockResolvedValueOnce({
      status: "error",
      error: {
        kind: "invalidInput",
        message: "The server could not be started: boom",
      },
    });
    fireEvent.click(testBtn);
    expect(
      await screen.findByText("The server could not be started: boom"),
    ).toBeDefined();
  });

  it("the preset command is pinned and local", () => {
    expect(BROWSER_PRESET.command).toMatch(/@playwright\/mcp@\d+\.\d+\.\d+ /);
    expect(BROWSER_PRESET.command).not.toContain("--headless");
    expect(BROWSER_PRESET.command).toContain("--isolated");
    expect(BROWSER_PRESET.command).toContain("--image-responses omit");
    expect(BROWSER_PRESET.command).toContain("--allowed-origins");
    expect(BROWSER_PRESET.command).not.toContain("@latest");
  });
});

