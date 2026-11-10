import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { loadLanguage, mountDiff } from "./cm";
import { useSettingsStore } from "../settings/store";
import { useWorkspaceStore } from "./store";

export function DiffView() {
  const { proposal, needsGitConfirm, reviewFile } = useWorkspaceStore(
    useShallow((s) => ({
      proposal: s.proposal,
      needsGitConfirm: s.needsGitConfirm,
      reviewFile: s.reviewDiff ? (s.review.find((f) => f.path === s.reviewDiff) ?? null) : null,
    })),
  );
  const { acceptProposal, rejectProposal, confirmGit, showReviewDiff } =
    useWorkspaceStore.getState();
  // A change waiting for an answer comes first; otherwise a file the agent already wrote.
  const diff = proposal
    ? proposal
    : reviewFile
      ? { path: reviewFile.path, original: reviewFile.original ?? "", proposed: reviewFile.current }
      : null;
  const resolved = useSettingsStore((s) => s.resolved);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current || !diff) return;
    const parent = editorRef.current;
    const { path, original, proposed } = diff;
    let cancelled = false;
    let view: ReturnType<typeof mountDiff> | null = null;
    // The diff is coloured by the file's language, loaded before mounting.
    void loadLanguage(path).then(() => {
      if (!cancelled) view = mountDiff(parent, original, proposed, resolved, path);
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [diff?.path, diff?.original, diff?.proposed, resolved]);

  if (!diff) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/60 select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs font-medium text-neutral-400">
            {proposal ? "Proposed changes to:" : "The agent's changes to:"}
          </span>
          <span className="text-xs font-mono font-semibold text-neutral-200 truncate">
            {diff.path}
          </span>
        </div>
        {!proposal && (
          <button
            type="button"
            onClick={() => showReviewDiff(null)}
            className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        )}
        {proposal && (
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
        )}
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
