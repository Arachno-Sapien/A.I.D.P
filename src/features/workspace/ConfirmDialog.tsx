import { useId, useRef } from "react";
import { useModalFocus } from "./useModalFocus";

export interface ConfirmDialogProps {
  title: string;
  message: string;
  /** The button that does it, like "Move to Recycle Bin". */
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/** A yes-or-no question before a change, like deleting. Focus starts on Cancel. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
        <h3 id={titleId} className="text-base font-semibold mb-2 break-words">
          {title}
        </h3>
        <p id={messageId} className="text-sm text-neutral-400 mb-6">
          {message}
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
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
