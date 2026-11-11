import { type FormEvent, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { commands, type ServerConfig } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";
import { ConfirmDialog } from "../workspace/ConfirmDialog";

export const BROWSER_PRESET = {
  name: "browser",
  command:
    'npx -y @playwright/mcp@0.0.85 --headless --isolated --image-responses omit --allowed-origins "http://localhost:*;http://127.0.0.1:*"',
} as const;

type TestStatus = { ok: boolean; text: string };

export function OutsideTools() {
  const nameId = useId();
  const nameHintId = useId();
  const commandId = useId();
  const commandHintId = useId();

  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestStatus>>({});
  const [removing, setRemoving] = useState<ServerConfig | null>(null);
  const [trusting, setTrusting] = useState<ServerConfig | null>(null);

  async function reload(checkAlive?: () => boolean) {
    const res = await commands.listMcpServers();
    if (checkAlive && !checkAlive()) return;
    if (res.status === "ok") {
      setServers(res.data);
      setListError(null);
    } else {
      setListError(appErrorText(res.error));
    }
    setLoaded(true);
  }

  useEffect(() => {
    let alive = true;
    void reload(() => alive);
    return () => {
      alive = false;
    };
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await commands.addMcpServer(name, command);
      if (res.status === "ok") {
        setName("");
        setCommand("");
        await reload();
      } else {
        setAddError(appErrorText(res.error));
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(server: ServerConfig, enabled: boolean) {
    setListError(null);
    const res = await commands.setMcpServerEnabled(server.id, enabled);
    if (res.status === "ok") {
      if (!enabled) {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[server.id];
          return next;
        });
      }
      await reload();
    } else {
      setListError(appErrorText(res.error));
    }
  }

  async function handleAutoApprove(server: ServerConfig, on: boolean) {
    setTrusting(null);
    setListError(null);
    const res = await commands.setMcpServerAutoApprove(server.id, on);
    if (res.status === "ok") {
      await reload();
    } else {
      setListError(appErrorText(res.error));
    }
  }

  async function handleTest(server: ServerConfig) {
    setTestingId(server.id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[server.id];
      return next;
    });
    try {
      const res = await commands.testMcpServer(server.id);
      if (res.status === "ok") {
        setTestResults((prev) => ({
          ...prev,
          [server.id]: {
            ok: true,
            text: `${res.data.length} tools: ${res.data.join(", ")}`,
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [server.id]: {
            ok: false,
            text: appErrorText(res.error),
          },
        }));
      }
    } finally {
      setTestingId((prev) => (prev === server.id ? null : prev));
    }
  }

  async function handleRemove(server: ServerConfig) {
    setRemoving(null);
    setListError(null);
    const res = await commands.deleteMcpServer(server.id);
    if (res.status === "ok") {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[server.id];
        return next;
      });
      await reload();
    } else {
      setListError(appErrorText(res.error));
    }
  }

  return (
    <div className="app-raised p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Outside tools (MCP)</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Programs that give the agent more tools, for example a browser. They
          run on your computer with your access, outside the opened folder, so
          add only ones you trust. The agent asks before every call.
        </p>
      </div>

      {listError && (
        <p role="alert" className="text-xs text-red-400">
          {listError}
        </p>
      )}

      {loaded && servers.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">No outside tools yet.</p>
      ) : (
        <ul className="space-y-2">
          {servers.map((server) => {
            const isTesting = testingId === server.id;
            const status = testResults[server.id];
            return (
              <li
                key={server.id}
                className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-semibold text-neutral-100">
                      {server.name}
                    </div>
                    <div className="font-mono text-xs text-neutral-400 break-words [overflow-wrap:anywhere]">
                      {server.command}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 min-h-[24px] px-1 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        aria-label={`${server.name} on`}
                        disabled={isTesting}
                        onChange={(e) =>
                          void handleToggle(server, e.target.checked)
                        }
                        className="rounded bg-neutral-800 border-neutral-700 cursor-pointer disabled:cursor-default disabled:opacity-60 focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
                      />
                      <span>On</span>
                    </label>
                    <label className="flex items-center gap-1.5 min-h-[24px] px-1 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={server.autoApprove}
                        aria-label={`${server.name} runs without asking`}
                        onChange={(e) =>
                          e.target.checked
                            ? setTrusting(server)
                            : void handleAutoApprove(server, false)
                        }
                        className="rounded bg-neutral-800 border-neutral-700 cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
                      />
                      <span>Run without asking</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Test ${server.name}`}
                      disabled={isTesting}
                      onClick={() => void handleTest(server)}
                      className="min-w-[5.25rem] px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-900 text-xs text-neutral-200 hover:border-neutral-700 hover:text-white transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
                    >
                      {isTesting ? "Starting…" : "Test"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${server.name}`}
                      disabled={isTesting}
                      onClick={() => setRemoving(server)}
                      className="px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-900 text-xs text-neutral-300 hover:border-red-900/80 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {status && (
                  <p
                    aria-live="polite"
                    role={status.ok ? undefined : "alert"}
                    className={`text-xs ${status.ok ? "text-neutral-300" : "text-red-400"}`}
                  >
                    {status.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={(e) => void handleAdd(e)} className="space-y-3 pt-1">
        <div className="space-y-1">
          <label
            htmlFor={nameId}
            className="block text-xs font-medium text-neutral-200"
          >
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={nameHintId}
            spellCheck={false}
            autoComplete="off"
            className="w-full max-w-xs px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          />
          <p id={nameHintId} className="text-xs text-neutral-400">
            Lowercase letters and digits, like &quot;browser&quot;.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={commandId}
            className="block text-xs font-medium text-neutral-200"
          >
            Command
          </label>
          <input
            id={commandId}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            aria-describedby={commandHintId}
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg font-mono text-xs text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          />
          <p id={commandHintId} className="text-xs text-neutral-400">
            What you would type in a terminal to start the server. Don&apos;t
            put passwords or tokens in it: it is saved as plain text.
          </p>
        </div>

        {addError && (
          <p role="alert" className="text-xs text-red-400">
            {addError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={adding}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setName(BROWSER_PRESET.name);
              setCommand(BROWSER_PRESET.command);
              setAddError(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-200 text-xs hover:border-neutral-700 hover:text-white transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            Fill in Browser checks (Playwright)
          </button>
        </div>

        <p className="text-xs text-neutral-400">
          Lets the agent open pages on localhost in a hidden browser and read
          them. Needs Node.js 18 or newer. The first start downloads the
          server, and may ask you to install a browser.
        </p>
      </form>

      {trusting &&
        createPortal(
          <ConfirmDialog
            title={`Let ${trusting.name} run without asking?`}
            message="The agent will call its tools without Run or Deny; each call still shows on a card. A page or file the agent reads could steer what it does with them. Starts with the next task; press Stop to end one."
            confirmLabel="Run without asking"
            onConfirm={() => void handleAutoApprove(trusting, true)}
            onCancel={() => setTrusting(null)}
          />,
          document.body,
        )}

      {removing &&
        createPortal(
          <ConfirmDialog
            title={`Remove ${removing.name}?`}
            message="The agent will no longer have its tools."
            confirmLabel="Remove"
            onConfirm={() => void handleRemove(removing)}
            onCancel={() => setRemoving(null)}
          />,
          document.body,
        )}
    </div>
  );
}
