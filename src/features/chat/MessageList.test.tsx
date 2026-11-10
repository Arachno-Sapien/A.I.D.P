// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
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
  it("a sent message shows its attachments", () => {
    const sent: UiMessage = {
      id: "u1", role: "user", text: "", status: "complete",
      attachments: [{ id: "b".repeat(64), name: "notes.md", mime: "text/plain", size: 5, kind: "text", warning: null }],
    };
    const { getByText } = render(<MessageList messages={[sent]} />);
    expect(getByText("notes.md")).toBeDefined();
  });

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
  it("stays where the reader scrolled to while a reply grows", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    const sizes = { scrollHeight: 100_000, clientHeight: 800 };
    for (const [key, value] of Object.entries(sizes)) {
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
    }
    try {
      const messages = many(50);
      const { container, rerender } = render(<MessageList messages={messages} />);
      const box = container.firstElementChild as HTMLElement;
      // The reader scrolls up, away from the end.
      let top = 5000;
      Object.defineProperty(box, "scrollTop", { configurable: true, get: () => top });
      fireEvent.scroll(box);
      top = 1000;
      fireEvent.scroll(box);
      await new Promise((r) => setTimeout(r, 30));
      scrollTo.mockClear();

      // A streamed chunk: same messages, the last one longer.
      const last = messages[49]!;
      rerender(<MessageList messages={[...messages.slice(0, 49), { ...last, text: `${last.text} more` }]} />);
      await new Promise((r) => setTimeout(r, 30));
      expect(scrollTo).not.toHaveBeenCalled();

      // Back at the end, it follows again.
      top = 99_200;
      fireEvent.scroll(box);
      rerender(<MessageList messages={[...messages.slice(0, 49), { ...last, text: `${last.text} and more` }]} />);
      await vi.waitFor(() => expect(scrollTo).toHaveBeenCalled());
    } finally {
      HTMLElement.prototype.scrollTo = original;
      for (const key of Object.keys(sizes)) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });
});
