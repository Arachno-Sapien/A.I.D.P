import { useState } from "react";
import { commands, type ModelInfo } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";
import { useModelsStore } from "./store";

export interface ChooseModelsProps {
  connectionId: number;
  available: ModelInfo[];
  initialSelected?: string[];
  onSave: () => void;
  onCancel: () => void;
}

export function ChooseModels({
  connectionId,
  available,
  initialSelected,
  onSave,
  onCancel,
}: ChooseModelsProps) {
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelected ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filtered = available.filter(
    (m) =>
      m.displayName.toLowerCase().includes(filter.toLowerCase()) ||
      m.id.toLowerCase().includes(filter.toLowerCase()),
  );

  const displayed = filtered.slice(0, 200);

  const toggleModel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const chosen = available.filter((m) => selectedIds.has(m.id));
    const res = await commands.setModels(connectionId, chosen);
    if (res.status === "error") {
      setSaveError(appErrorText(res.error));
      setSaving(false);
      return;
    }
    await useModelsStore.getState().refresh();
    setSaving(false);
    onSave();
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">Choose models</h3>
        <p className="text-xs text-neutral-400 mt-1">
          Pick which models from this connection should appear in the chat picker.
        </p>
      </div>

      {saveError && (
        <div className="mb-3 p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-xs text-red-200">
          {saveError}
        </div>
      )}

      {available.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-400">
          The provider returned no models. The connection is saved; try again from the Models page.
        </div>
      ) : (
        <>
          <div className="mb-3">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter models..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
            />
            {filtered.length > 200 && (
              <div className="text-xs text-neutral-400 mt-1">
                Showing 200 of {filtered.length}. Type to narrow the list.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border border-neutral-800 rounded-lg divide-y divide-neutral-800/60 p-2 space-y-1 mb-4">
            {displayed.map((model) => (
              <label
                key={model.id}
                className="flex items-center gap-3 p-2 rounded hover:bg-neutral-800/50 cursor-pointer text-sm text-neutral-200 select-none"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(model.id)}
                  onChange={() => toggleModel(model.id)}
                  aria-label={model.displayName}
                  className="rounded border-neutral-700 bg-neutral-900 text-neutral-100 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-white truncate">
                    {model.displayName}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono truncate">
                    {model.id}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={available.length === 0 || saving}
          onClick={handleSave}
          className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
