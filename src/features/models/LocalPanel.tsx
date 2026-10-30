import { useState } from "react";
import { useModelsStore } from "./store";

const SUGGESTIONS = [
  { name: "qwen2.5-coder:1.5b", size: "986 MB", recommended: true },
  { name: "qwen2.5-coder:0.5b", size: "398 MB" },
  { name: "qwen2.5-coder:3b", size: "1.9 GB" },
  { name: "qwen2.5-coder:7b", size: "4.7 GB" },
];

const CONTEXT_OPTIONS = [2048, 4096, 8192, 16384, 32768];

export function LocalPanel() {
  const {
    ollama,
    localModels,
    pull,
    pullError,
    ollamaLoading,
    startOllama,
    openOllamaDownload,
    pullModel,
    cancelPull,
    deleteLocal,
    unloadLocal,
    setContext,
  } = useModelsStore();

  const [customModel, setCustomModel] = useState("");
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(
    null,
  );

  const formatSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(1)} GB`;
    }
    return `${sizeMb} MB`;
  };

  if (!ollama || ollama.state === "notInstalled") {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Ollama (local models)
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
            Not installed
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Ollama runs models on this computer.
        </p>
        <button
          type="button"
          onClick={() => void openOllamaDownload()}
          className="px-3 py-1.5 bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Get Ollama
        </button>
      </div>
    );
  }

  if (ollama.state === "stopped") {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Ollama (local models)
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-amber-400">
            Stopped
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Ollama is installed but not running.
        </p>
        <button
          type="button"
          onClick={() => void startOllama()}
          disabled={ollamaLoading}
          className="px-3 py-1.5 bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {ollamaLoading ? "Starting…" : "Start"}
        </button>
      </div>
    );
  }

  // Running state
  const pullPct = pull
    ? Math.min(
        100,
        Math.round(
          (pull.completedMb / Math.max(1, pull.totalMb || pull.completedMb)) *
            100,
        ),
      )
    : 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">
            Ollama (local models)
          </h2>
          <span className="text-[11px] text-neutral-500 font-mono">
            v{ollama.version}
          </span>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40">
          Running
        </span>
      </div>

      {/* Active pull progress */}
      {pull && (
        <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-200">{pull.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-neutral-400 font-mono">{pullPct}%</span>
              <button
                type="button"
                onClick={() => void cancelPull()}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-neutral-100 h-2 rounded-full transition-all duration-200"
              style={{ width: `${pullPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>{pull.status}</span>
            <span>
              {pull.completedMb} MB / {pull.totalMb || "?"} MB
            </span>
          </div>

          {pull.totalMb > 8000 && (
            <div className="text-[11px] text-amber-400">
              Too large for most machines without a GPU
            </div>
          )}
          {pull.totalMb > 4000 && pull.totalMb <= 8000 && (
            <div className="text-[11px] text-amber-400">
              Needs about 8 GB of free memory
            </div>
          )}
        </div>
      )}

      {pullError && (
        <div className="p-2.5 rounded bg-red-950/50 border border-red-900/60 text-xs text-red-300">
          {pullError}
        </div>
      )}

      {/* Downloaded models */}
      {localModels.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Downloaded models
          </h3>
          <div className="space-y-2">
            {localModels.map((m) => {
              const isConfirming = confirmDeleteName === m.name;
              return (
                <div
                  key={m.name}
                  className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white">
                        {m.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                        {formatSize(m.sizeMb)}
                      </span>
                      {m.parameterSize && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          {m.parameterSize}
                        </span>
                      )}
                      {m.quantization && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          {m.quantization}
                        </span>
                      )}
                      {m.supportsTools && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-900/40">
                          Tools
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {m.loaded && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-emerald-400">
                            Loaded · {m.loaded.sizeMb} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => void unloadLocal(m.name)}
                            className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors cursor-pointer"
                          >
                            Free memory
                          </button>
                        </div>
                      )}

                      {!isConfirming && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteName(m.name)}
                          className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-red-950 hover:text-red-300 text-neutral-400 text-xs transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {isConfirming && (
                    <div className="p-2 rounded bg-neutral-900 border border-red-950 flex items-center justify-between text-xs">
                      <span className="text-neutral-300 text-xs">
                        Delete {m.name}? It frees {formatSize(m.sizeMb)} on disk.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmDeleteName(null);
                            await deleteLocal(m.name);
                          }}
                          className="px-2 py-0.5 bg-red-900/70 hover:bg-red-800 text-red-100 rounded text-xs transition-colors cursor-pointer font-medium"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteName(null)}
                          className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-neutral-400 pt-1 border-t border-neutral-900">
                    <label
                      htmlFor={`ctx-${m.name}`}
                      className="text-xs text-neutral-400"
                    >
                      Context length:
                    </label>
                    <select
                      id={`ctx-${m.name}`}
                      aria-label={`Context length for ${m.name}`}
                      value={m.numCtx}
                      onChange={(e) =>
                        void setContext(m.name, Number(e.target.value))
                      }
                      className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs focus:outline-none focus:border-neutral-500 cursor-pointer"
                    >
                      {CONTEXT_OPTIONS.filter(
                        (c) => c <= (m.contextLength ?? 32768),
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggested models / Download another model */}
      <div className="space-y-2 pt-2 border-t border-neutral-800/80">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          {localModels.length === 0
            ? "Download a model"
            : "Download another model"}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
            <div
              key={s.name}
              className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/80 flex items-center justify-between text-xs"
            >
              <div>
                <div className="font-medium text-neutral-200 flex items-center gap-1.5">
                  <span>{s.name}</span>
                  {s.recommended && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-normal">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-500">{s.size}</div>
              </div>

              <button
                type="button"
                onClick={() => void pullModel(s.name)}
                disabled={Boolean(pull)}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 hover:text-white rounded text-xs transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
              >
                Download
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1.5">
          <input
            type="text"
            placeholder="Download any other model (e.g. llama3.2:3b)"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            disabled={Boolean(pull)}
            className="flex-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
          />
          <button
            type="button"
            onClick={() => {
              if (customModel.trim()) {
                const name = customModel.trim();
                setCustomModel("");
                void pullModel(name);
              }
            }}
            disabled={!customModel.trim() || Boolean(pull)}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 hover:text-white text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

