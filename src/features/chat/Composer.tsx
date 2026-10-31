import { useState } from "react";
import { Paperclip } from "lucide-react";
import { useModelsStore } from "../models/store";
import { AttachmentChip } from "./AttachmentChip";
import { NO_VISION, type createChatStore } from "./store";

export interface ComposerProps {
  /** The chat this composer writes to: Chat's store or the side chat's. */
  store: ReturnType<typeof createChatStore>;
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  store,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = "Type a message... (Shift+Enter for newline)",
}: ComposerProps) {
  const [input, setInput] = useState("");
  const pending = store((s) => s.pending);
  const notice = store((s) => s.attachNotice);
  const { pickAttachments, pasteFiles, removeAttachment } = store.getState();

  // A model known not to see can't take an image: say so before Send, not after.
  const cannotSee = useModelsStore((s) => {
    const selected = s.selected;
    const model = selected
      ? s.chatModels.find(
          (m) =>
            m.connectionId === selected.connectionId &&
            m.modelId === selected.modelId,
        )
      : undefined;
    return model?.supportsVision === false;
  });
  const visionBlocked = cannotSee && pending.some((a) => a.kind === "image");
  const shownNotice = visionBlocked ? NO_VISION : notice;
  const canSend =
    (input.trim() !== "" || pending.length > 0) && !disabled && !visionBlocked;

  const handleSend = () => {
    if (!canSend || streaming) return;
    const text = input;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Pasted files (a screenshot, a copied file) are attached; pasted text stays text.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void pasteFiles(files);
  };

  return (
    <div className="p-4 border-t border-neutral-800 bg-neutral-900/40">
      <div className="max-w-4xl mx-auto">
        {shownNotice && (
          <div
            role="status"
            className="mb-2 whitespace-pre-line text-xs text-amber-300"
          >
            {shownNotice}
          </div>
        )}
        <div className="app-inset flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl p-2 focus-within:border-neutral-700 transition-colors">
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {pending.map((a) => (
                <AttachmentChip
                  key={a.id}
                  attachment={a}
                  onRemove={() => removeAttachment(a.id)}
                />
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Attach files"
              title="Attach images, text files or PDFs (or drop or paste them)"
              disabled={disabled}
              onClick={() => void pickAttachments()}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
            >
              <Paperclip size={16} aria-hidden="true" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              className="flex-1 bg-transparent resize-none px-2 py-1 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none max-h-32 min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="app-accent bg-accent text-accent-fg hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
