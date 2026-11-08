import { useId, useRef } from "react";
import { useModalFocus } from "./useModalFocus";

export interface UnsavedChangesDialogProps {
  /** How many files have unsaved changes. */
  count: number;
  /** "Discard and quit" when quitting, "Discard" when leaving a folder. */
  discardLabel: string;
  onCancel(): void;
  onDiscard(): void;
  onSaveAll(): void;
}

/**
 * The "Unsaved changes" question before quitting or leaving a folder. A modal
 * dialog that screen readers announce with its title and message. Focus starts
 * on Cancel, the safe answer, Tab stays inside, Escape cancels, and focus goes
 * back where it was when the dialog closes.
 */
export function UnsavedChangesDialog({
  count,
  discardLabel,
  onCancel,
  onDiscard,
  onSaveAll,
}: UnsavedChangesDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalFocus(panelRef, cancelRef, onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="app-raised bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-2xl text-neutral-100"
      >
        <h3 id={titleId} className="text-base font-semibold mb-2">
          Unsaved changes
        </h3>
        <p id={messageId} className="text-sm text-neutral-400 mb-6">
          You have unsaved changes in {count} {count === 1 ? "file" : "files"}.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            {discardLabel}
          </button>
          <button
            type="button"
            onClick={onSaveAll}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-white text-neutral-900 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            Save all
          </button>
        </div>
      </div>
    </div>
  );
}
