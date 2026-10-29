// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("copies a code block's exact text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const { getByRole, findByRole } = render(
      <Markdown text={"```ts\nconst a = 1;\n```"} />,
    );

    const button = getByRole("button", { name: "Copy" });
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledWith("const a = 1;");
    await findByRole("button", { name: "Copied" });
  });

  it("does not render raw HTML", () => {
    const { container } = render(
      <Markdown
        text={"<b>bold</b><script>alert(1)</script><img src=x onerror=alert(1)>"}
      />,
    );

    expect(container.querySelector("b, script, img")).toBeNull();
  });

  it("does not turn links into navigation", () => {
    const { container, getByText } = render(
      <Markdown text={"[site](https://example.com)"} />,
    );

    expect(container.querySelector("a")).toBeNull();
    const span = getByText("site");
    expect(span.getAttribute("title")).toBe("https://example.com");
  });

  it("renders headings and lists inside the reply wrapper", () => {
    const { container } = render(
      <Markdown text={"## Title\n\n1. one\n2. two"} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe("reply-md");
    expect(wrapper.querySelector("h2")?.textContent).toBe("Title");
    expect(wrapper.querySelectorAll("ol > li")).toHaveLength(2);
  });
});

