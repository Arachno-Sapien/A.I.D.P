// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/bindings", () => ({
  commands: {
    pickAttachments: vi.fn(),
    attachBytes: vi.fn(),
    readAttachment: vi.fn().mockResolvedValue({ status: "ok", data: "iVBORw0KGgo=" }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_: unknown) => {};
  },
}));

import { commands } from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { Composer } from "./Composer";
import { createChatStore } from "./store";

const png = { id: "a".repeat(64), name: "shot.png", mime: "image/png", size: 2048, kind: "image" as const, warning: null };
const env = {
  id: "b".repeat(64), name: ".env", mime: "text/plain", size: 12, kind: "text" as const,
  warning: "Looks like a secret file",
};

afterEach(() => {
  cleanup();
});

describe("Composer attachments", () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore("chat");
    useModelsStore.setState({ selected: { connectionId: 1, modelId: "m" }, chatModels: [] });
  });

  const renderComposer = (onSend = vi.fn()) =>
    render(<Composer store={store} onSend={onSend} onStop={vi.fn()} streaming={false} />);

  it("the paperclip adds what Rust returns and says what it refused", async () => {
    vi.mocked(commands.pickAttachments).mockResolvedValue({
      status: "ok",
      data: { added: [png], refused: ["tool.bin isn't an image, a PDF or a text file"] },
    });
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
    await screen.findByText("shot.png");
    expect(screen.getByRole("status").textContent).toContain("tool.bin");
  });

  it("a chip can be removed, and a secret-looking file says so", () => {
    store.getState().addAttachments([png, env]);
    renderComposer();
    expect(screen.getByText("Looks like a secret file")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remove shot.png" }));
    expect(screen.queryByText("shot.png")).toBeNull();
    expect(store.getState().pending.map((a) => a.name)).toEqual([".env"]);
  });

  it("the message box has a name for screen readers", () => {
    renderComposer();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDefined();
  });

  it("Send works with only an attachment", () => {
    store.getState().addAttachments([png]);
    const onSend = vi.fn();
    renderComposer(onSend);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("");
  });

  it("an image and a model that can't see block Send with the reason", () => {
    useModelsStore.setState({
      chatModels: [
        {
          connectionId: 1, connectionLabel: "Local", modelId: "m", displayName: "M", isDefault: true,
          supportsTools: null, supportsVision: false, isLocal: true, contextTokens: null,
        },
      ],
    });
    store.getState().addAttachments([png]);
    renderComposer();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("This model can't read images");
  });

  it("pasting an image attaches it; pasting text does not", async () => {
    vi.mocked(commands.attachBytes).mockResolvedValue({ status: "ok", data: png });
    renderComposer();
    const box = screen.getByRole("textbox");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    fireEvent.paste(box, { clipboardData: { files: [file] } });
    await screen.findByText("shot.png");
    expect(commands.attachBytes).toHaveBeenCalledWith("shot.png", "iVBORw==");

    fireEvent.paste(box, { clipboardData: { files: [] } });
    expect(commands.attachBytes).toHaveBeenCalledTimes(1);
  });
});
