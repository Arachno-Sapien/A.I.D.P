import { useModelsStore } from "../models/store";

export function ModelPicker() {
  const { chatModels, selected, loaded, select } = useModelsStore();

  if (!loaded || chatModels.length === 0) {
    return null;
  }

  const selectedValue = selected
    ? `${selected.connectionId}:${selected.modelId}`
    : "";

  const uniqueConnectionIds = Array.from(
    new Set(chatModels.map((m) => m.connectionId)),
  );

  return (
    <div className="flex items-center justify-between px-6 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Model:</span>
        <select
          aria-label="Model"
          value={selectedValue}
          onChange={(e) => {
            const [connId, modId] = e.target.value.split(":");
            if (connId && modId) {
              select({ connectionId: Number(connId), modelId: modId });
            }
          }}
          className="bg-neutral-800 border border-neutral-700/80 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-600 cursor-pointer"
        >
          {uniqueConnectionIds.map((connId) => {
            const groupModels = chatModels.filter(
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
        </select>
      </div>
    </div>
  );
}
