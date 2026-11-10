import { useState } from "react";
import { useWorkspaceStore } from "./store";

const button =
  "px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default";

/** What the agent wrote without asking, to keep or undo when it finishes (decision 0028). */
export function ReviewCard() {
  const review = useWorkspaceStore((s) => s.review);
  const { showReviewDiff, undoReview, undoAll, keepReview } = useWorkspaceStore.getState();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (review.length === 0) return null;

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setNotice(await work());
    setBusy(false);
  };

  return (
    <section
      aria-label="Review the agent's changes"
      className="mx-4 mb-2 p-3 rounded-lg border border-neutral-700 bg-neutral-900/90 text-xs text-neutral-200"
    >
      <h3 className="font-semibold text-neutral-100">
        The agent changed {review.length} {review.length === 1 ? "file" : "files"}
      </h3>
      <ul className="mt-2 max-h-40 overflow-auto space-y-1">
        {review.map((f) => (
          <li key={f.path} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Show changes to ${f.path}`}
              onClick={() => showReviewDiff(f.path)}
              className="flex-1 min-w-0 text-left truncate font-mono text-neutral-200 hover:underline cursor-pointer"
              title={f.path}
            >
              {f.path}
            </button>
            <span className="text-neutral-400">{f.original === null ? "new" : "edited"}</span>
            <button
              type="button"
              aria-label={`Undo ${f.path}`}
              disabled={busy}
              onClick={() => void run(() => undoReview(f.path))}
              className={`${button} bg-neutral-800 hover:bg-neutral-700 text-neutral-300`}
            >
              Undo
            </button>
          </li>
        ))}
      </ul>
      {notice && (
        <p role="status" className="mt-2 whitespace-pre-wrap text-amber-300">
          {notice}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={keepReview}
          className={`${button} bg-green-600 hover:bg-green-500 text-white`}
        >
          Keep all
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(undoAll)}
          className={`${button} bg-neutral-800 hover:bg-neutral-700 text-neutral-300`}
        >
          Undo all
        </button>
      </div>
    </section>
  );
}
