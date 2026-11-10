// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
// The real highlighter, watched: which colours each code block is given.
vi.mock("prism-react-renderer", async (importOriginal) => {
  const real = await importOriginal<typeof import("prism-react-renderer")>();
  return { ...real, Highlight: vi.fn(real.Highlight) };
});

import { Highlight, themes } from "prism-react-renderer";
import { Markdown } from "./Markdown";
import { useSettingsStore } from "../settings/store";

describe("Markdown", () => {
  it("code blocks follow the theme's base", () => {
    // jsdom drops the hsl() colours both code themes use, so check the theme given.
    const code = "```ts\nconst a = 1;\n```";
    useSettingsStore.setState({ resolved: "light" });
    const light = render(<Markdown text={code} />);
    expect(vi.mocked(Highlight).mock.lastCall?.[0].theme).toBe(themes.oneLight);
    light.unmount();
    useSettingsStore.setState({ resolved: "dark" });
    // No automatic cleanup here (known-issues): unmount, or later tests see two blocks.
    const dark = render(<Markdown text={code} />);
    expect(vi.mocked(Highlight).mock.lastCall?.[0].theme).toBe(themes.oneDark);
    dark.unmount();
  });

  it("a reply's image never gets a data: source", () => {
    // The CSP allows data: images for attachment thumbnails; a model's reply
    // must not use that to show images of its own.
    const { container } = render(
      <Markdown text={"![x](data:image/png;base64,iVBORw0KGgo=)"} />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src") ?? "").not.toMatch(/^data:/);
  });

  it("a finished code block is not highlighted again as the reply grows", () => {
    // Each streamed chunk renders the reply again, with a new onApply.
    const block = "```ts\nconst a = 1;\n```\n\n";
    const view = render(<Markdown text={`${block}Now`} onApply={() => {}} />);
    const before = view.container.querySelector("pre");
    vi.mocked(Highlight).mockClear();

    view.rerender(<Markdown text={`${block}Now the rest`} onApply={() => {}} />);

    expect(Highlight).not.toHaveBeenCalled();
    expect(view.container.querySelector("pre")).toBe(before);
    view.unmount();
  });

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

  it("renders a table", () => {
    const { container } = render(
      <Markdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );

    expect(container.querySelectorAll("table th")).toHaveLength(2);
    expect(container.querySelectorAll("table td")).toHaveLength(2);
  });

  it("shows Apply only when onApply is given", () => {
    const onApply = vi.fn();
    const { queryByRole, unmount } = render(
      <Markdown text={"```ts\nconst a = 1;\n```"} />,
    );
    expect(queryByRole("button", { name: "Apply" })).toBeNull();
    unmount();

    const { getByRole } = render(
      <Markdown text={"```ts\nconst a = 1;\n```"} onApply={onApply} />,
    );
    const applyButton = getByRole("button", { name: "Apply" });
    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledWith("const a = 1;", "ts");
  });
});

