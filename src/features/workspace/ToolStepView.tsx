import type { ToolAction } from "../../lib/bindings";
import type { ToolStep } from "../chat/store";
import { useWorkspaceStore } from "./store";

export interface ToolStepViewProps {
  step: ToolStep;
  onAnswer?: (id: number, approve: boolean) => void;
}

function stepLabel(action: ToolAction): string {
  switch (action.tool) {
    case "listFiles":
      return `List files in ${action.path || "the project"}`;
    case "readFile":
      return `Read ${action.path}`;
    case "search":
      return `Search "${action.query}"`;
    case "editFile":
      return `Edit ${action.path}`;
    case "createFile":
      return `Create ${action.path}`;
    case "runCommand":
      return `Run command`;
    case "invalid":
      return `Unknown tool call ${action.name}`;
  }
}

/** Whether the step waits for the user to approve or decline it. */
export function awaitsAnswer(step: ToolStep): boolean {
  return step.needsAnswer && !step.answered && !step.outcome;
}

export function ToolStepView({ step, onAnswer }: ToolStepViewProps) {
  const { acceptProposal, rejectProposal } = useWorkspaceStore();
  const label = stepLabel(step.action);
  const isPending = !step.outcome;
  const showApproval = awaitsAnswer(step);

  return (
    <div className="my-2 p-2.5 rounded-lg border border-neutral-800 bg-neutral-900/80 text-xs text-neutral-200">
      <div className="flex items-center justify-between font-mono font-medium text-neutral-300">
        <span>{label}</span>
        {isPending && (
          <span
            aria-label="Running"
            className="inline-block w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin ml-2 align-middle"
          />
        )}
      </div>

      {/* The command stays after it is answered, so the history shows what ran. */}
      {step.action.tool === "runCommand" && (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-neutral-400">
            in {step.action.folder}
          </div>
          <pre className="p-2 rounded bg-neutral-950 font-mono text-xs text-neutral-200 overflow-x-auto whitespace-pre-wrap">
            {step.action.command}
          </pre>
          {showApproval && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAnswer?.(step.id, true)}
                className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                Run
              </button>
              <button
                type="button"
                onClick={() => onAnswer?.(step.id, false)}
                className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                Deny
              </button>
            </div>
          )}
        </div>
      )}

      {showApproval &&
        (step.action.tool === "editFile" ||
          step.action.tool === "createFile") && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-neutral-300">
              Review the change in the editor
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void acceptProposal()}
                className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => rejectProposal()}
                className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                Reject
              </button>
            </div>
          </div>
        )}

      {step.outcome && (
        <div className="mt-2 text-xs">
          {step.outcome.status === "ok" && (
            <div className="text-neutral-300">{step.outcome.summary}</div>
          )}
          {step.outcome.status === "declined" && (
            <div className="text-neutral-400">Declined</div>
          )}
          {step.outcome.status === "error" && (
            <div className="text-red-400">{step.outcome.message}</div>
          )}
          {step.outcome.status === "stopped" && (
            <div className="text-neutral-400">Stopped</div>
          )}
          {step.outcome.status === "command" && (
            <div className="space-y-1">
              <div className="text-neutral-400">
                {step.outcome.timedOut
                  ? "Timed out"
                  : `Exit code ${step.outcome.exitCode ?? "unknown"}`}
              </div>
              <pre className="max-h-48 overflow-auto p-2 rounded bg-neutral-950 font-mono text-xs text-neutral-200 whitespace-pre-wrap">
                {step.outcome.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
