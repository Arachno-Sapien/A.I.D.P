import { useState } from "react";
import {
  commands,
  type AddedConnection,
  type ConnectionKind,
} from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";
import { ChooseModels } from "./ChooseModels";
import { CUSTOM_ID, PROVIDERS } from "./providers";

export interface AddConnectionDialogProps {
  onClose: () => void;
}

export function AddConnectionDialog({ onClose }: AddConnectionDialogProps) {
  const [step, setStep] = useState<"form" | "models">("form");
  const [providerId, setProviderId] = useState(PROVIDERS[0]?.id ?? "openai");
  const [label, setLabel] = useState(PROVIDERS[0]?.label ?? "OpenAI");
  const [kind, setKind] = useState<ConnectionKind>(
    PROVIDERS[0]?.kind ?? "openaiCompat",
  );
  const [baseUrl, setBaseUrl] = useState(
    PROVIDERS[0]?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedResult, setAddedResult] = useState<AddedConnection | null>(null);

  const handleProviderChange = (newId: string) => {
    setProviderId(newId);
    setError(null);
    if (newId === CUSTOM_ID) {
      setLabel("Custom");
      setKind("openaiCompat");
      setBaseUrl("");
    } else {
      const preset = PROVIDERS.find((p) => p.id === newId);
      if (preset) {
        setLabel(preset.label);
        setKind(preset.kind);
        setBaseUrl(preset.baseUrl);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || testing) return;

    setTesting(true);
    setError(null);

    const res = await commands.addConnection({
      kind,
      label,
      baseUrl,
      apiKey: apiKey.trim(),
    });

    setTesting(false);

    if (res.status === "error") {
      setError(appErrorText(res.error));
    } else {
      setApiKey("");
      setAddedResult(res.data);
      setStep("models");
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Add a model"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl text-neutral-100 animate-in fade-in zoom-in-95 duration-100">
        {step === "form" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-base font-semibold text-white">Add a model</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-200 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <label
                htmlFor="provider-select"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Provider
              </label>
              <select
                id="provider-select"
                aria-label="Provider"
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700 cursor-pointer"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM_ID}>Custom endpoint</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="name-input"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Name
              </label>
              <input
                id="name-input"
                aria-label="Name"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700"
              />
            </div>

            {providerId === CUSTOM_ID && (
              <>
                <div>
                  <label
                    htmlFor="kind-select"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Kind
                  </label>
                  <select
                    id="kind-select"
                    aria-label="Kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as ConnectionKind)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700 cursor-pointer"
                  >
                    <option value="openaiCompat">OpenAI-compatible</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="baseurl-input"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Base URL
                  </label>
                  <input
                    id="baseurl-input"
                    aria-label="Base URL"
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="key-input"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                API key
              </label>
              <input
                id="key-input"
                aria-label="API key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={testing || !apiKey.trim()}
                className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {testing ? "Testing..." : "Test and add"}
              </button>
            </div>
          </form>
        ) : (
          addedResult && (
            <ChooseModels
              connectionId={addedResult.connection.id}
              available={addedResult.available}
              onSave={onClose}
              onCancel={onClose}
            />
          )
        )}
      </div>
    </div>
  );
}
