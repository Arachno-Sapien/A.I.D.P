import { useEffect, useRef } from "react";
import { mountDiff } from "./cm";
import { useSettingsStore } from "../settings/store";
import { useWorkspaceStore } from "./store";

export function DiffView() {
  const {
    proposal,
    needsGitConfirm,
    acceptProposal,
    rejectProposal,
    confirmGit,
  } = useWorkspaceStore();
  const resolved = useSettingsStore((s) => s.resolved);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current || !proposal) return;
    const view = mountDiff(
      editorRef.current,
      proposal.original,
      proposal.proposed,
      resolved,
    );
    return () => {
      view.destroy();
    };
  }, [proposal?.path, proposal?.original, proposal?.proposed, resolved]);

  if (!proposal) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/60 select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs font-medium text-neutral-400">
            Proposed changes to:
          </span>
          <span className="text-xs font-mono font-semibold text-neutral-200 truncate">
            {proposal.path}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void acceptProposal()}
            className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={rejectProposal}
            className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded transition-colors cursor-pointer"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Git confirmation banner */}
      {needsGitConfirm && (
        <div className="bg-amber-950/80 border-b border-amber-800/80 px-4 py-2 text-xs text-amber-200 flex items-center justify-between">
          <span>
            This folder isn't a git repository, so this change can't be undone
            easily. Accept anyway?
          </span>
          <div className="flex items-center gap-2 ml-4">
            <button
              type="button"
              onClick={() => void confirmGit()}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-semibold rounded transition-colors cursor-pointer"
            >
              Accept anyway
            </button>
            <button
              type="button"
              onClick={rejectProposal}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Diff editor view */}
      <div ref={editorRef} className="flex-1 overflow-auto" />
    </div>
  );
}
