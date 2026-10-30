import { useState } from "react";
import { commands, type ModelInfo } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";
import { AddConnectionDialog } from "./AddConnectionDialog";
import { ChooseModels } from "./ChooseModels";
import { LocalPanel } from "./LocalPanel";
import { useModelsStore } from "./store";

export interface ModelsScreenProps {
  onAddClick?: () => void;
  startAdding?: boolean;
  onAddFinished?: () => void;
}

export function ModelsScreen({
  onAddClick,
  startAdding = false,
  onAddFinished,
}: ModelsScreenProps) {
  const { connections, chatModels, loadError, refresh } = useModelsStore();
  const cloudConnections = connections.filter((c) => c.kind !== "ollama");
  const [internalAdding, setInternalAdding] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    id: number;
    text: string;
    isError: boolean;
  } | null>(null);

  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [newKey, setNewKey] = useState("");
  const [replacingError, setReplacingError] = useState<string | null>(null);
  const [replacingSaving, setReplacingSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [chooseModelsTarget, setChooseModelsTarget] = useState<{
    connectionId: number;
    available: ModelInfo[];
    initialSelected?: string[];
  } | null>(null);

  const isAddingOpen = startAdding || internalAdding;

  const handleOpenAdd = () => {
    if (onAddClick) {
      onAddClick();
    } else {
      setInternalAdding(true);
    }
  };

  const handleCloseAdd = () => {
    setInternalAdding(false);
    onAddFinished?.();
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);

    const res = await commands.testConnection(id);
    setTestingId(null);

    if (res.status === "ok") {
      setTestResult({ id, text: "Working", isError: false });
    } else {
      setTestResult({
        id,
        text: appErrorText(res.error),
        isError: true,
      });
    }

    await refresh();
  };

  const handleReplaceKey = async (id: number) => {
    if (!newKey.trim() || replacingSaving) return;

    setReplacingSaving(true);
    setReplacingError(null);

    const res = await commands.replaceKey(id, newKey.trim());
    setReplacingSaving(false);

    if (res.status === "error") {
      setReplacingError(appErrorText(res.error));
    } else {
      setNewKey("");
      setReplacingId(null);
      await refresh();
    }
  };

  const handleConfirmDelete = async (id: number) => {
    const res = await commands.deleteConnection(id);
    setDeletingId(null);
    if (res.status === "error") {
      setTestResult({
        id,
        text: appErrorText(res.error),
        isError: true,
      });
      return;
    }
    await refresh();
  };

  const handleOpenChooseModels = async (id: number) => {
    setTestResult(null);
    const res = await commands.availableModels(id);
    if (res.status === "ok") {
      const currentPicks = chatModels
        .filter((m) => m.connectionId === id)
        .map((m) => m.modelId);
      setChooseModelsTarget({
        connectionId: id,
        available: res.data,
        initialSelected: currentPicks,
      });
    } else {
      setTestResult({
        id,
        text: appErrorText(res.error),
        isError: true,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between pb-6 border-b border-neutral-800 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Models</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your AI model connections and select models to use in chat.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white rounded-lg transition-colors cursor-pointer"
        >
          Add a model
        </button>
      </div>

      {loadError ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <div className="max-w-md w-full bg-neutral-900 border border-red-900/60 rounded-xl p-8 shadow-xl">
            <h2 className="text-base font-semibold text-red-200 mb-2">
              Unable to load connections
            </h2>
            <p className="text-xs text-red-400">
              {loadError}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <LocalPanel />

          {cloudConnections.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center bg-neutral-900/40 border border-neutral-800 rounded-xl">
              <div className="text-neutral-400 text-sm font-medium mb-3">
                No cloud models yet
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                Add a model
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cloudConnections.map((c) => {
            const maskedKey = c.keyHint ? `••••••••${c.keyHint}` : "••••••••";

            let testStatusText = "Never tested";
            if (c.lastTestedAt != null) {
              const formattedDate = new Date(
                c.lastTestedAt * 1000,
              ).toLocaleString();
              testStatusText = c.lastTestOk
                ? `Working · ${formattedDate}`
                : `Failed · ${formattedDate}`;
            }

            return (
              <div
                key={c.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                      {c.label}
                      <span className="text-xs font-normal text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
                        {c.kind === "anthropic" ? "Anthropic" : "OpenAI-compatible"}
                      </span>
                    </h2>
                    <div className="text-xs text-neutral-400 font-mono mt-1">
                      {c.baseUrl}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono text-neutral-300">{maskedKey}</div>
                    <div
                      className={`mt-1 ${
                        c.lastTestOk === true
                          ? "text-emerald-400"
                          : c.lastTestOk === false
                          ? "text-red-400"
                          : "text-neutral-500"
                      }`}
                    >
                      {testStatusText}
                    </div>
                  </div>
                </div>

                {testResult?.id === c.id && (
                  <div
                    className={`text-xs p-2.5 rounded-lg border ${
                      testResult.isError
                        ? "bg-red-950/60 border-red-800 text-red-200"
                        : "bg-emerald-950/60 border-emerald-800 text-emerald-200"
                    }`}
                  >
                    {testResult.text}
                  </div>
                )}

                {/* Inline Replace Key */}
                {replacingId === c.id && (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-neutral-300">
                      Replace API key
                    </div>
                    <input
                      type="password"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="New API key (sk-...)"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-neutral-700"
                    />
                    {replacingError && (
                      <div className="text-xs text-red-400">
                        {replacingError}
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingId(null);
                          setNewKey("");
                          setReplacingError(null);
                        }}
                        className="px-2.5 py-1 text-xs text-neutral-300 bg-neutral-800 rounded hover:bg-neutral-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={replacingSaving || !newKey.trim()}
                        onClick={() => handleReplaceKey(c.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-neutral-900 bg-neutral-100 rounded hover:bg-white disabled:opacity-50 cursor-pointer"
                      >
                        {replacingSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Delete Confirmation */}
                {deletingId === c.id && (
                  <div className="bg-neutral-950 border border-red-900/60 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs text-neutral-200">
                      Delete this connection and its key?
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        className="px-2.5 py-1 text-xs text-neutral-300 bg-neutral-800 rounded hover:bg-neutral-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        aria-label="Confirm delete"
                        onClick={() => handleConfirmDelete(c.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-500 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/80">
                  <button
                    type="button"
                    disabled={testingId === c.id}
                    onClick={() => handleTest(c.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {testingId === c.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingId(replacingId === c.id ? null : c.id);
                      setNewKey("");
                      setReplacingError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Replace key
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenChooseModels(c.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Choose models
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(deletingId === c.id ? null : c.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
            </div>
          )}
        </div>
      )}

      {/* Add Connection Dialog */}
      {isAddingOpen && <AddConnectionDialog onClose={handleCloseAdd} />}

      {/* Choose Models Modal */}
      {chooseModelsTarget && (
        <div
          role="dialog"
          aria-label="Choose models"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl text-neutral-100">
            <ChooseModels
              connectionId={chooseModelsTarget.connectionId}
              available={chooseModelsTarget.available}
              initialSelected={chooseModelsTarget.initialSelected}
              onSave={() => setChooseModelsTarget(null)}
              onCancel={() => setChooseModelsTarget(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
