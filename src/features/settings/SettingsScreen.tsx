import { useEffect } from "react";
import { parseModelKey, useModelsStore } from "../models/store";
import { useSettingsStore } from "./store";
import { commands, type KeepAlive, type Theme } from "../../lib/bindings";

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

const KEEP_ALIVE_OPTIONS: { id: KeepAlive; label: string }[] = [
  { id: "ollamaDefault", label: "Ollama default (5 minutes)" },
  { id: "fiveMinutes", label: "5 minutes" },
  { id: "thirtyMinutes", label: "30 minutes" },
  { id: "oneHour", label: "1 hour" },
  { id: "untilFreed", label: "Until Free memory is clicked" },
  { id: "afterEachReply", label: "Unload after each reply" },
];

export function SettingsScreen() {
  const { theme, keepAlive, loaded, loadError, load, setTheme, setKeepAlive } =
    useSettingsStore();
  const { chatModels, selected, refresh } = useModelsStore();

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  const selectedValue = selected
    ? `${selected.connectionId}:${selected.modelId}`
    : "";

  const cloudModels = chatModels.filter((m) => !m.isLocal);
  const localModels = chatModels.filter((m) => m.isLocal);
  const uniqueCloudConnectionIds = Array.from(
    new Set(cloudModels.map((m) => m.connectionId)),
  );

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 text-neutral-100 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your default model, appearance, and local runtime settings.
          </p>
        </div>

        {loadError && (
          <div className="p-3 rounded-lg bg-red-950/50 border border-red-900/60 text-xs text-red-300">
            {loadError}
          </div>
        )}

        {/* Section 1: Default model */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Default model</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Used when starting a new chat or workspace session.
            </p>
          </div>

          {chatModels.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              No models available. Add a model on the Models screen.
            </p>
          ) : (
            <select
              aria-label="Default model"
              value={selectedValue}
              onChange={async (e) => {
                const parsed = parseModelKey(e.target.value);
                if (parsed) {
                  await commands.setDefaultModel(
                    parsed.connectionId,
                    parsed.modelId,
                  );
                  await refresh();
                }
              }}
              className="w-full max-w-sm px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-neutral-600 cursor-pointer"
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
                    >
                      {m.displayName}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>

        {/* Section 2: Theme */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Theme</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Choose the interface appearance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {THEME_OPTIONS.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void setTheme(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? "bg-neutral-100 text-neutral-900 border-neutral-100 font-semibold"
                      : "bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Keep local models loaded */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Keep local models loaded
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Longer answers faster; shorter frees memory sooner.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {KEEP_ALIVE_OPTIONS.map((k) => {
              const active = keepAlive === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => void setKeepAlive(k.id)}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer flex items-center justify-between ${
                    active
                      ? "bg-neutral-800/80 border-neutral-600 text-white font-medium"
                      : "bg-neutral-950 border-neutral-800/80 text-neutral-300 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  <span>{k.label}</span>
                  {active && (
                    <span className="text-[10px] text-neutral-400 font-mono">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

