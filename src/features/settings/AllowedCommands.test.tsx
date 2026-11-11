// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listAllowedCommands: vi.fn(),
    removeAllowedCommand: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

import { commands } from "../../lib/bindings";
import { AllowedCommands } from "./AllowedCommands";

describe("AllowedCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commands.listAllowedCommands).mockResolvedValue({
      status: "ok",
      data: [
        { folder: "C:/work/app", command: "npm test" },
        { folder: "C:/work/app", command: "npm run lint" },
        { folder: "C:/work/site", command: "npm test" },
      ],
    });
  });
  afterEach(() => cleanup());

  it("lists commands by folder and removes one", async () => {
    render(<AllowedCommands />);
    await waitFor(() => expect(screen.getByText("C:/work/site")).toBeTruthy());
    expect(screen.getByText("C:/work/app")).toBeTruthy();
    expect(screen.getAllByText("npm test")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove npm run lint in C:/work/app" }));
    await waitFor(() => expect(screen.queryByText("npm run lint")).toBeNull());
    expect(commands.removeAllowedCommand).toHaveBeenCalledWith("C:/work/app", "npm run lint");
  });

  it("says when there are none", async () => {
    vi.mocked(commands.listAllowedCommands).mockResolvedValue({ status: "ok", data: [] });
    render(<AllowedCommands />);
    await waitFor(() => expect(screen.getByText(/No commands are always allowed/)).toBeTruthy());
  });
});
