import { commands, type ToolAction } from "../../lib/bindings";
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
    case "startServer":
      return `Start server`;
    case "serverOutput":
      return `Read server ${action.server} output`;
    case "stopServer":
      return `Stop server ${action.server}`;
    case "mcpStart":
      return `Start outside tools: ${action.server}`;
    case "mcpTool":
      return `${action.server}: ${action.name}`;
    case "invalid":
      return `Unknown tool call ${action.name}`;
  }
}

/** Whether the step waits for the user to approve or decline it. */
export function awaitsAnswer(step: ToolStep): boolean {
  return step.needsAnswer && !step.answered && !step.outcome;
}

export function ToolStepView({ step, onAnswer }: ToolStepViewProps) {
  // The actions never change, so a step doesn't render with every store change.
  const { acceptProposal, rejectProposal } = useWorkspaceStore.getState();
  const label = stepLabel(step.action);
  const isPending = !step.outcome;
  const showApproval = awaitsAnswer(step);
  const command =
    step.action.tool === "runCommand" || step.action.tool === "startServer"
      ? step.action.command
      : null;
  const runCard =
    step.action.tool === "runCommand"
      ? { subtitle: `in ${step.action.folder}`, body: step.action.command }
      : step.action.tool === "startServer"
        ? {
            subtitle: `in ${step.action.folder}. Keeps running in a terminal tab until you stop it.`,
            body: step.action.command,
          }
      : step.action.tool === "mcpTool"
        ? {
            subtitle: `Outside tool. This is sent to ${step.action.server}:`,
            body: step.action.arguments,
          }
        : null;

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

      {/* The command or arguments stay after the answer, so history shows what ran. */}
      {runCard && (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-neutral-400">{runCard.subtitle}</div>
          <pre className="p-2 rounded bg-neutral-950 font-mono text-xs text-neutral-200 overflow-x-auto whitespace-pre-wrap">
            {runCard.body}
          </pre>
          {showApproval && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAnswer?.(step.id, true)}
                className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
              >
                Run
              </button>
              <button
                type="button"
                onClick={() => onAnswer?.(step.id, false)}
                className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-semibold rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
              >
                Deny
              </button>
              {command !== null && (
                <button
                  type="button"
                  title="Run it now and from now on in this folder without asking (Settings lists these)"
                  onClick={() => {
                    void commands.allowCommand(command).then(() => onAnswer?.(step.id, true));
                  }}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
                >
                  Always allow
                </button>
              )}
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
          {step.outcome.status === "text" && (
            <pre className="max-h-48 overflow-auto p-2 rounded bg-neutral-950 font-mono text-xs text-neutral-200 whitespace-pre-wrap">
              {step.outcome.output}
            </pre>
          )}
          {step.outcome.status === "server" && (
            <div className="space-y-1">
              <div className="text-neutral-400">
                {`Server ${step.outcome.server}: its output is in a terminal tab`}
              </div>
              <pre className="max-h-48 overflow-auto p-2 rounded bg-neutral-950 font-mono text-xs text-neutral-200 whitespace-pre-wrap">
                {step.outcome.output}
              </pre>
            </div>
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
