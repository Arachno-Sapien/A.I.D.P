// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EffortSelect } from "./EffortSelect";
import type { ChatModel } from "../../lib/bindings";

const base: ChatModel = {
  connectionId: 1,
  connectionLabel: "OpenRouter",
  modelId: "anthropic/claude",
  displayName: "Claude",
  isDefault: false,
  supportsTools: true,
  isLocal: false,
  contextTokens: null,
};

afterEach(cleanup);

describe("EffortSelect", () => {
  it("shows the stored level and reports changes", () => {
    const onChange = vi.fn();
    render(<EffortSelect model={{ ...base, effort: "high" }} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Claude effort" }) as HTMLSelectElement;
    expect(select.value).toBe("high");

    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(select, { target: { value: "medium" } });
    expect(onChange).toHaveBeenLastCalledWith("medium");
  });

  it("is off for a model that refuses effort", () => {
    render(<EffortSelect model={{ ...base, effortSupport: "none" }} onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Claude effort" }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText("This model doesn't take an effort level.")).toBeDefined();
  });
});
