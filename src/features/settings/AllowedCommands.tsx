import { useEffect, useState } from "react";
import { commands, type AllowedCommand } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

/** Commands the user chose to always allow, by folder, with Remove (decision 0030). */
export function AllowedCommands() {
  const [items, setItems] = useState<AllowedCommand[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void commands.listAllowedCommands().then((res) => {
      if (res.status === "ok") setItems(res.data);
      else setError(appErrorText(res.error));
    });
  }, []);

  async function remove(item: AllowedCommand) {
    const res = await commands.removeAllowedCommand(item.folder, item.command);
    if (res.status === "ok") {
      setItems((list) => list?.filter((i) => i !== item) ?? null);
    } else {
      setError(appErrorText(res.error));
    }
  }

  const folders = [...new Set((items ?? []).map((i) => i.folder))];

  return (
    <div className="app-raised p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Commands that run without asking</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Commands you chose to always allow from a Run card. Each one runs in
          its folder only, and only when the agent asks for exactly that
          command.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {items && items.length === 0 && (
        <p className="text-xs text-neutral-500 italic">No commands are always allowed.</p>
      )}

      {folders.map((folder) => (
        <div key={folder} className="space-y-1.5">
          <div className="text-xs text-neutral-400 font-mono break-all">{folder}</div>
          <ul className="space-y-1">
            {(items ?? [])
              .filter((i) => i.folder === folder)
              .map((item) => (
                <li
                  key={item.command}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-neutral-950 border border-neutral-800"
                >
                  <code className="text-xs text-neutral-200 break-all">{item.command}</code>
                  <button
                    type="button"
                    aria-label={`Remove ${item.command} in ${item.folder}`}
                    onClick={() => void remove(item)}
                    className="shrink-0 px-2 py-0.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded cursor-pointer"
                  >
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
