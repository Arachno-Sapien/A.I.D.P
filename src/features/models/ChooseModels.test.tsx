// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    setModels: vi.fn(),
    listConnections: vi.fn(),
    chatModels: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { ChooseModels } from "./ChooseModels";

describe("ChooseModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("a failed save shows the error and stays open", async () => {
    vi.mocked(commands.setModels).mockResolvedValue({
      status: "error",
      error: { kind: "storage", message: "disk full" },
    });

    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <ChooseModels
        connectionId={1}
        available={[{ id: "m1", displayName: "Model 1", contextWindow: null }]}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't read or write the local database: disk full"),
      ).toBeDefined();
    });

    expect(onSave).not.toHaveBeenCalled();
    // Modal is still open (Save and Cancel buttons are still rendered)
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });
});
