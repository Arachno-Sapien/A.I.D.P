import { useId } from "react";
import type { ChatModel, Effort } from "../../lib/bindings";

const NO_EFFORT = "This model doesn't take an effort level.";

/** The effort (thinking) level for one model: Default leaves it to the provider. */
export function EffortSelect({
  model,
  onChange,
  compact = false,
}: {
  model: ChatModel;
  /** Narrow rows: the hint goes into the tooltip and a screen-reader text, not on screen. */
  compact?: boolean;
  onChange: (effort: Effort | null) => void;
}) {
  const off = model.effortSupport === "none";
  const hintId = useId();
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 text-neutral-400 ${compact ? "" : "shrink-0"}`}>
      <label className="flex items-center gap-2">
        Effort
        <select
          aria-label={`${model.displayName} effort`}
          value={model.effort ?? ""}
          disabled={off}
          title={off ? NO_EFFORT : undefined}
          aria-describedby={off ? hintId : undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as Effort))}
          className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Default</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {off && (
        <span id={hintId} className={compact ? "sr-only" : "text-neutral-500"}>
          {NO_EFFORT}
        </span>
      )}
    </span>
  );
}
