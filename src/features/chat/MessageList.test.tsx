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

  const many = (count: number): UiMessage[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      text: `message ${i}`,
      status: "complete",
    }));

  it("keeps only the messages near the view on the page", () => {
    // Every rendered reply stays in memory, so a long chat must not render all of them.
    const { container } = render(<MessageList messages={many(200)} />);
    const rows = container.querySelectorAll("[data-index]").length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(40);
  });

  it("follows the end of the conversation", async () => {
    // jsdom has no layout: give the scroll box a size, or every scroll
    // target is clamped to 0.
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    const sizes = { scrollHeight: 100_000, clientHeight: 800 };
    for (const [key, value] of Object.entries(sizes)) {
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
    }
    try {
      const { rerender } = render(<MessageList messages={many(50)} />);
      scrollTo.mockClear();
      rerender(<MessageList messages={many(51)} />);
      await vi.waitFor(() => expect(scrollTo).toHaveBeenCalled());
      const calls = scrollTo.mock.calls;
      const top = calls[calls.length - 1]?.[0]?.top as number;
      // 51 rows at the estimated height reach far past the first screen.
      expect(top).toBeGreaterThan(1000);
    } finally {
      HTMLElement.prototype.scrollTo = original;
      for (const key of Object.keys(sizes)) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });
});
