import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { parseModelKey, useModelsStore } from "../models/store";
import { EffortSelect } from "../models/EffortSelect";

export interface ModelPickerProps {
  children?: ReactNode;
  left?: ReactNode;
}

export function ModelPicker({ children, left }: ModelPickerProps = {}) {
  // Not the whole store: each Ollama download line replaces `pull`.
  const { chatModels, selected, loaded, ollama } = useModelsStore(
    useShallow((s) => ({
      chatModels: s.chatModels,
      selected: s.selected,
      loaded: s.loaded,
      ollama: s.ollama,
    })),
  );
  const { select, setEffort } = useModelsStore.getState();
  // Not loadError: ChatScreen swaps the whole chat for that.
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasModels = loaded && chatModels.length > 0;

  // With no models only a left control (the chat list toggle) keeps the bar.
  if (!hasModels && !left) {
    return null;
  }

  const selectedValue = selected
    ? `${selected.connectionId}:${selected.modelId}`
    : "";

  const isOllamaRunning = ollama?.state === "running";

  const cloudModels = chatModels.filter((m) => !m.isLocal);
  const localModels = chatModels.filter((m) => m.isLocal);

  const uniqueCloudConnectionIds = Array.from(
    new Set(cloudModels.map((m) => m.connectionId)),
  );

  const currentModel = selected
    ? chatModels.find(
        (m) =>
          m.connectionId === selected.connectionId &&
          m.modelId === selected.modelId,
      )
    : null;
  const fullModelName =
    currentModel?.displayName || currentModel?.modelId || undefined;

  return (
    <div className="app-surface flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-6 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {left}
        {hasModels && (
          <>
            <span className="text-xs text-neutral-400 shrink-0">Model:</span>
            <select
              aria-label="Model"
              value={selectedValue}
              title={fullModelName}
              onChange={(e) => {
                const parsed = parseModelKey(e.target.value);
                if (parsed) {
                  void select(parsed).then((err) => setSaveError(err ?? null));
                }
              }}
              className="app-inset bg-neutral-800 border border-neutral-700/80 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-600 cursor-pointer min-w-0 max-w-full truncate"
            >
              {uniqueCloudConnectionIds.map((connId) => {
                const groupModels = cloudModels.filter(
                  (m) => m.connectionId === connId,
                );
                const label = groupModels[0]?.connectionLabel ?? "";
                return (
                  <optgroup key={connId} label={label}>
                    {groupModels.map((m) => (
                      <option
                        key={`${m.connectionId}:${m.modelId}`}
                        value={`${m.connectionId}:${m.modelId}`}
                      >
                        {m.displayName}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              {localModels.length > 0 && (
                <optgroup label="Local · Ollama">
                  {localModels.map((m) => (
                    <option
                      key={`${m.connectionId}:${m.modelId}`}
                      value={`${m.connectionId}:${m.modelId}`}
                      disabled={!isOllamaRunning}
                    >
                      {isOllamaRunning
                        ? m.displayName
                        : `${m.displayName} (Ollama stopped)`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {currentModel && (
              <span className="text-xs">
                <EffortSelect
                  compact
                  model={currentModel}
                  onChange={(e) =>
                    void setEffort(currentModel, e).then((err) => setSaveError(err ?? null))
                  }
                />
              </span>
            )}
            {saveError && (
              <span role="alert" className="text-xs text-red-400 min-w-0 truncate" title={saveError}>
                {saveError}
              </span>
            )}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
