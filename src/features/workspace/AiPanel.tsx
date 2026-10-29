import { useState } from "react";
import { Composer } from "../chat/Composer";
import { MessageList } from "../chat/MessageList";
import { ModelPicker } from "../chat/ModelPicker";
import type { ApplyTarget, SendExtra, UiMessage } from "../chat/store";
import { useModelsStore } from "../models/store";
import { buffers } from "./buffers";
import { useWorkspaceChatStore } from "./chatStore";
import {
  buildContent,
  chipsFor,
  FILE_CHAR_LIMIT,
  WORKSPACE_SYSTEM,
  type FileContext,
  type SelectionContext,
} from "./context";
import { useWorkspaceStore } from "./store";

export interface AiPanelProps {
  onApply?: (code: string, language: string, message: UiMessage) => void;
}

export function AiPanel({ onApply }: AiPanelProps) {
  const { tabs, active, selection, propose } = useWorkspaceStore();
  const { messages, streaming, send, stop } = useWorkspaceChatStore();
  const { selected } = useModelsStore();

  const [fileRemoved, setFileRemoved] = useState<Record<string, boolean>>({});
  const [fileAdded, setFileAdded] = useState<Record<string, boolean>>({});
  const [selectionRemoved, setSelectionRemoved] = useState<
    Record<string, boolean>
  >({});

  const activeTab = tabs.find((t) => t.path === active);

  const chips = chipsFor(activeTab, buffers);

  const isSecret = chips.file?.reason === "secret";
  const isTooLarge = chips.file?.reason === "tooLarge";
  const isManuallyAdded = activeTab ? Boolean(fileAdded[activeTab.path]) : false;
  const isManuallyRemoved = activeTab
    ? Boolean(fileRemoved[activeTab.path])
    : false;
  const isSelRemoved = activeTab
    ? Boolean(selectionRemoved[activeTab.path])
    : false;

  const fileEnabled = activeTab
    ? isSecret
      ? isManuallyAdded && !isManuallyRemoved
      : !isManuallyRemoved && !isTooLarge
    : false;

  const selInfo =
    activeTab && selection?.path === activeTab.path ? selection.info : null;
  // A selection needs no file chip (that is how a too-large file is asked about),
  // but a secret file's selection is sent only after the file is added by hand.
  const selectionEnabled = Boolean(
    activeTab && selInfo && !isSelRemoved && (!isSecret || isManuallyAdded),
  );

  const canAddFile =
    activeTab &&
    !fileEnabled &&
    !isTooLarge &&
    (isSecret || isManuallyRemoved);

  const handleSend = async (question: string) => {
    if (!selected) return;

    // Read the buffer now, not at the last render: the user may have typed since.
    let fileContext: FileContext | undefined;
    const fresh = activeTab ? buffers.text(activeTab.path) : undefined;
    if (
      fileEnabled &&
      activeTab &&
      fresh !== undefined &&
      fresh.length <= FILE_CHAR_LIMIT
    ) {
      fileContext = {
        path: activeTab.path,
        text: fresh,
      };
    }

    let selectionContext: SelectionContext | undefined;
    if (selectionEnabled && activeTab && selInfo) {
      selectionContext = {
        path: activeTab.path,
        text: selInfo.text,
        fromLine: selInfo.fromLine,
        toLine: selInfo.toLine,
      };
    }

    const content =
      fileContext || selectionContext
        ? buildContent(question, {
            file: fileContext,
            selection: selectionContext,
          })
        : question;

    const chipLabels: string[] = [];
    if (fileContext && activeTab) {
      chipLabels.push(activeTab.name);
    }
    if (selectionContext && activeTab) {
      chipLabels.push(
        `${activeTab.name}:${selectionContext.fromLine}-${selectionContext.toLine}`,
      );
    }

    let target: ApplyTarget | undefined;
    if (selectionContext && activeTab) {
      target = { path: activeTab.path, selection: selectionContext.text };
    } else if (fileContext && activeTab) {
      target = { path: activeTab.path, selection: null };
    } else if (activeTab) {
      target = { path: activeTab.path, selection: null };
    }

    const extra: SendExtra = {
      content,
      system: WORKSPACE_SYSTEM,
      chips: chipLabels.length > 0 ? chipLabels : undefined,
      target,
    };

    await send(question, selected, extra);
  };

  const handleApply = (code: string, language: string, message: UiMessage) => {
    if (onApply) {
      onApply(code, language, message);
    } else if (message.target) {
      void propose(message.target, code);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/30 border-l border-neutral-800 text-neutral-100">
      <ModelPicker />

      {/* Chips row */}
      {activeTab && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-neutral-800 bg-neutral-900/40 text-xs">
          {fileEnabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700/60 font-mono text-neutral-200">
              <span>{activeTab.name}</span>
              <button
                type="button"
                aria-label={`Remove ${activeTab.name}`}
                onClick={() =>
                  setFileRemoved((prev) => ({
                    ...prev,
                    [activeTab.path]: true,
                  }))
                }
                className="text-neutral-400 hover:text-neutral-200 cursor-pointer ml-0.5"
              >
                ×
              </button>
            </span>
          )}

          {selectionEnabled && selInfo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700/60 font-mono text-neutral-200">
              <span>
                {activeTab.name}:{selInfo.fromLine}-{selInfo.toLine}
              </span>
              <button
                type="button"
                aria-label="Remove selection"
                onClick={() =>
                  setSelectionRemoved((prev) => ({
                    ...prev,
                    [activeTab.path]: true,
                  }))
                }
                className="text-neutral-400 hover:text-neutral-200 cursor-pointer ml-0.5"
              >
                ×
              </button>
            </span>
          )}

          {canAddFile && (
            <button
              type="button"
              aria-label={`Add ${activeTab.name}`}
              onClick={() => {
                setFileAdded((prev) => ({
                  ...prev,
                  [activeTab.path]: true,
                }));
                setFileRemoved((prev) => ({
                  ...prev,
                  [activeTab.path]: false,
                }));
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 border border-dashed border-neutral-700 cursor-pointer transition-colors"
            >
              + Add {activeTab.name}
            </button>
          )}

          {isTooLarge && (
            <span className="text-neutral-500 italic">
              {activeTab.name} (too large to attach)
            </span>
          )}
        </div>
      )}

      {/* Message list */}
      <MessageList messages={messages} onApply={handleApply} />

      {/* Composer */}
      <Composer
        onSend={handleSend}
        onStop={stop}
        streaming={streaming}
        disabled={!selected}
        placeholder="Ask about this code..."
      />
    </div>
  );
}
