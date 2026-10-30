// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    addConnection: vi.fn(),
    setModels: vi.fn(),
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "./store";
import { AddConnectionDialog } from "./AddConnectionDialog";

describe("AddConnectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses a password field for the key", () => {
    render(<AddConnectionDialog onClose={vi.fn()} />);
    const keyInput = screen.getByLabelText("API key");
    expect(keyInput.getAttribute("type")).toBe("password");
  });

  it("sends the typed values to addConnection", async () => {
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: {
        connection: {
          id: 1,
          kind: "openaiCompat",
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        available: [
          { id: "m1", displayName: "Model One", contextWindow: null, supportsTools: null },
        ],
      },
    });

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "openrouter" },
    });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-secret-1234" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(commands.addConnection).toHaveBeenCalledWith({
        kind: "openaiCompat",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-secret-1234",
      });
    });
  });

  it("shows the error and keeps the form when the test fails", async () => {
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "error",
      error: {
        kind: "provider",
        error: { kind: "invalidKey" },
      },
    });

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-wrong-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "The provider rejected the API key. Check the key and try again.",
        ),
      ).toBeDefined();
    });

    const keyInput = screen.getByLabelText("API key") as HTMLInputElement;
    expect(keyInput.value).toBe("sk-wrong-key");
  });

  it("moves to model choice and forgets the key", async () => {
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: {
        connection: {
          id: 1,
          kind: "openaiCompat",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        available: [
          { id: "gpt-4", displayName: "GPT-4", contextWindow: 8192, supportsTools: null },
        ],
      },
    });

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-secret-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(screen.getByText("GPT-4")).toBeDefined();
    });

    expect(screen.queryByDisplayValue("sk-secret-1234")).toBeNull();
  });

  it("saves only the ticked models", async () => {
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: {
        connection: {
          id: 1,
          kind: "openaiCompat",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        available: [
          { id: "m1", displayName: "Model One", contextWindow: null, supportsTools: null },
          { id: "m2", displayName: "Model Two", contextWindow: null, supportsTools: null },
        ],
      },
    });
    vi.mocked(commands.setModels).mockResolvedValue({
      status: "ok",
      data: null,
    });
    const refreshSpy = vi.spyOn(useModelsStore.getState(), "refresh").mockResolvedValue();

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Model One")).toBeDefined();
    });

    // Check only Model One
    fireEvent.click(screen.getByLabelText("Model One"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(commands.setModels).toHaveBeenCalledWith(1, [
        { id: "m1", displayName: "Model One", contextWindow: null, supportsTools: null },
      ]);
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  it("shows a message when the provider returns no models", async () => {
    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: {
        connection: {
          id: 1,
          kind: "openaiCompat",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        available: [],
      },
    });

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "The provider returned no models. The connection is saved; try again from the Models page.",
        ),
      ).toBeDefined();
    });

    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("caps long lists and filters by text", async () => {
    const models = Array.from({ length: 300 }, (_, i) => ({
      id: `model-${i}`,
      displayName: `Model ${i}`,
      contextWindow: null,
      supportsTools: null,
    }));

    vi.mocked(commands.addConnection).mockResolvedValue({
      status: "ok",
      data: {
        connection: {
          id: 1,
          kind: "openaiCompat",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          keyHint: "1234",
          lastTestedAt: 100,
          lastTestOk: true,
        },
        available: models,
      },
    });

    render(<AddConnectionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and add" }));

    await waitFor(() => {
      expect(screen.getByText("Showing 200 of 300. Type to narrow the list.")).toBeDefined();
    });

    // Filter by typing
    const filterInput = screen.getByPlaceholderText("Filter models...");
    fireEvent.change(filterInput, { target: { value: "Model 299" } });

    expect(screen.getByText("Model 299")).toBeDefined();
    expect(screen.queryByText("Model 1 ")).toBeNull();
  });
});
