// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real Markdown, counted: each call is one render of one message's text.
vi.mock("./Markdown", async (importOriginal) => {
  const real = await importOriginal<typeof import("./Markdown")>();
  return { Markdown: vi.fn(real.Markdown) };
});

import { Markdown } from "./Markdown";
import { MessageList } from "./MessageList";
import type { UiMessage } from "./store";

afterEach(() => {
  cleanup();
});

describe("MessageList", () => {
  it("re-renders only the message that changed", () => {
    // Every streamed chunk makes a new messages array in which only the
    // streaming message is a new object; the others must not parse again.
    const done: UiMessage = { id: "a1", role: "assistant", text: "first reply", status: "complete" };
    const live: UiMessage = { id: "a2", role: "assistant", text: "sec", status: "streaming" };
    const onApply = vi.fn();
    const renderStep = vi.fn();
    const { rerender } = render(
      <MessageList messages={[done, live]} onApply={onApply} renderStep={renderStep} />,
    );
    vi.mocked(Markdown).mockClear();

    rerender(
      <MessageList
        messages={[done, { ...live, text: "second" }]}
        onApply={onApply}
        renderStep={renderStep}
      />,
    );
    expect(Markdown).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Markdown).mock.calls[0][0].text).toBe("second");
  });
});
