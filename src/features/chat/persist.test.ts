import { describe, expect, it } from "vitest";
import { fromStored, toStored } from "./persist";
import type { UiMessage } from "./store";
import type { StoredMessage } from "../../lib/bindings";

describe("persist", () => {
  it("round-trips stored messages", () => {
    const userMsg: UiMessage = {
      id: "u1",
      role: "user",
      text: "hello",
      content: "hello with content",
      chips: ["file: a.txt"],
      status: "complete",
    };

    const userRow: StoredMessage = {
      id: 10,
      role: "user",
      contentParts: toStored(userMsg),
      modelRef: null,
      modelName: null,
      status: "complete",
      errorKind: null,
      tokensIn: null,
      tokensOut: null,
      createdAt: 100,
    };

    const restoredUser = fromStored(userRow);
    expect(restoredUser.role).toBe("user");
    expect(restoredUser.text).toBe("hello");
    expect(restoredUser.content).toBe("hello with content");
    expect(restoredUser.chips).toEqual(["file: a.txt"]);
    expect(restoredUser.status).toBe("complete");

    const assistantMsg: UiMessage = {
      id: "a1",
      role: "assistant",
      text: "response",
      parts: [
        { kind: "text", text: "response" },
        {
          kind: "step",
          step: {
            id: 1,
            action: { tool: "readFile", path: "test.txt" },
            needsAnswer: false,
            outcome: { status: "ok", summary: "read 10 lines" },
          },
        },
      ],
      status: "complete",
      modelName: "gpt-4o",
    };

    const assistantRow: StoredMessage = {
      id: 11,
      role: "assistant",
      contentParts: toStored(assistantMsg),
      modelRef: "1:gpt-4o",
      modelName: "gpt-4o",
      status: "complete",
      errorKind: null,
      tokensIn: 10,
      tokensOut: 20,
      createdAt: 101,
    };

    const restoredAssistant = fromStored(assistantRow);
    expect(restoredAssistant.role).toBe("assistant");
    expect(restoredAssistant.text).toBe("response");
    expect(restoredAssistant.parts).toEqual(assistantMsg.parts);
    expect(restoredAssistant.modelName).toBe("gpt-4o");
    expect(restoredAssistant.status).toBe("complete");

    expect(fromStored(toStored(userMsg)).text).toBe("hello");

    const badRow: StoredMessage = {
      id: 12,
      role: "user",
      contentParts: "{bad",
      modelRef: null,
      modelName: null,
      status: "complete",
      errorKind: null,
      tokensIn: null,
      tokensOut: null,
      createdAt: 102,
    };
    const restoredBad = fromStored(badRow);
    expect(restoredBad.text).toBe("{bad");
    expect(restoredBad.parts).toBeUndefined();
  });
});


it("keeps a provider error's message", () => {
  const msg = {
    id: "a",
    role: "assistant",
    text: "partial",
    status: "error",
    error: { kind: "provider", message: "upstream failed" },
  } as Parameters<typeof toStored>[0];
  const row = {
    id: 5,
    role: "assistant",
    contentParts: toStored(msg),
    modelRef: null,
    modelName: null,
    status: "error",
    errorKind: "provider",
    tokensIn: null,
    tokensOut: null,
    createdAt: 1,
  } as Parameters<typeof fromStored>[0];

  expect(fromStored(row).error).toEqual({ kind: "provider", message: "upstream failed" });
});
