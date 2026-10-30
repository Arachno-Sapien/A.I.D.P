import type { ReactNode } from "react";
import { parseModelKey, useModelsStore } from "../models/store";

export interface ModelPickerProps {
  children?: ReactNode;
}

export function ModelPicker({ children }: ModelPickerProps = {}) {
  const { chatModels, selected, loaded, select, ollama } = useModelsStore();

  if (!loaded || chatModels.length === 0) {
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

  return (
    <div className="flex items-center justify-between px-6 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Model:</span>
        <select
          aria-label="Model"
          value={selectedValue}
          onChange={(e) => {
            const parsed = parseModelKey(e.target.value);
            if (parsed) {
              void select(parsed);
            }
          }}
          className="bg-neutral-800 border border-neutral-700/80 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-600 cursor-pointer"
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
      </div>
      {children}
    </div>
  );
}
