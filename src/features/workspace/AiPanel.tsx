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
import { ToolStepView } from "./ToolStepView";

export interface AiPanelProps {
  onApply?: (code: string, language: string, message: UiMessage) => void;
}

export function textBudget(contextTokens?: number | null): number {
  if (contextTokens === undefined || contextTokens === null) {
    return 100_000;
  }
  return Math.min(100_000, 2 * contextTokens);
}

export function AiPanel({ onApply }: AiPanelProps) {
  const { tabs, active, selection, propose } = useWorkspaceStore();
  const {
    messages,
    streaming,
    send,
    stop,
    answer,
    conversationId,
    remove,
    startNew,
  } = useWorkspaceChatStore();
  const { chatModels, selected } = useModelsStore();

  const [confirmClear, setConfirmClear] = useState(false);
  const [fileRemoved, setFileRemoved] = useState<Record<string, boolean>>({});
  const [fileAdded, setFileAdded] = useState<Record<string, boolean>>({});
  const [selectionRemoved, setSelectionRemoved] = useState<
    Record<string, boolean>
  >({});

  const currentModel = selected
    ? chatModels.find(
        (m) =>
          m.connectionId === selected.connectionId &&
          m.modelId === selected.modelId,
      )
    : null;
  const supportsTools = currentModel?.supportsTools ?? null;
  const budget = textBudget(currentModel?.contextTokens);

  const modelKey = selected ? `${selected.connectionId}:${selected.modelId}` : "";
  const [lastModelKey, setLastModelKey] = useState(modelKey);
  const [userAgentOn, setUserAgentOn] = useState<boolean | null>(null);

  if (modelKey !== lastModelKey) {
    setLastModelKey(modelKey);
    setUserAgentOn(null);
  }

  const isAgentDisabled = supportsTools === false;
  const isAgent = isAgentDisabled ? false : (userAgentOn ?? (supportsTools === true));

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

  const activeDocText = activeTab ? buffers.text(activeTab.path) : undefined;
  const isCut = Boolean(
    fileEnabled &&
      activeDocText !== undefined &&
      activeDocText.length > budget,
  );

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
      const fileText = fresh.length > budget ? fresh.slice(0, budget) : fresh;
      fileContext = {
        path: activeTab.path,
        text: fileText,
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
      system: isAgent ? undefined : WORKSPACE_SYSTEM,
      chips: chipLabels.length > 0 ? chipLabels : undefined,
      target,
      agent: isAgent ? true : undefined,
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
      <ModelPicker>
        <div className="flex items-center gap-3">
          <label
            className={`flex items-center gap-1.5 text-xs select-none ${
              isAgentDisabled
                ? "text-neutral-500 cursor-not-allowed"
                : "text-neutral-300 cursor-pointer"
            }`}
            title={isAgentDisabled ? "This model can't use tools" : undefined}
          >
            <input
              type="checkbox"
              aria-label="Agent"
              checked={isAgent}
              disabled={isAgentDisabled}
              title={isAgentDisabled ? "This model can't use tools" : undefined}
              onChange={(e) => setUserAgentOn(e.target.checked)}
              className="rounded bg-neutral-800 border-neutral-700 text-neutral-100 focus:ring-0 focus:ring-offset-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="font-medium">Agent</span>
          </label>

          {messages.length > 0 &&
            !streaming &&
            (confirmClear ? (
              <span className="flex items-center gap-1.5 text-xs text-neutral-300">
                <span>Clear this chat?</span>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmClear(false);
                    if (conversationId) {
                      await remove(conversationId);
                    } else {
                      startNew();
                    }
                  }}
                  className="px-1.5 py-0.5 bg-red-900/60 hover:bg-red-800 text-red-200 rounded text-[11px] cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Clear
              </button>
            ))}
        </div>
      </ModelPicker>

      {/* Chips row */}
      {activeTab && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-neutral-800 bg-neutral-900/40 text-xs">
          {fileEnabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700/60 font-mono text-neutral-200">
              <span>{activeTab.name}</span>
              {isCut && (
                <span className="text-neutral-400 font-sans text-[10px] ml-0.5">
                  (cut to fit the model's context)
                </span>
              )}
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
      <MessageList
        messages={messages}
        onApply={handleApply}
        renderStep={(step) => (
          <ToolStepView
            step={step}
            onAnswer={(id, approve) => void answer(id, approve)}
          />
        )}
      />

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
