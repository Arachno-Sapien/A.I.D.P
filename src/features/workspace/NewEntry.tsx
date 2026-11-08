import { FilePlus, FolderPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

type Kind = "file" | "folder";

/** Windows slashes become `/`, and a leading `/` or `./` goes: both mean the top of the folder. */
export function cleanPath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/^(\.?\/)+/, "");
}

export interface NewEntryProps {
  /** The folder a new item goes in unless the name says otherwise; "" is the top. */
  folder: string;
  /** Makes it; resolves to the message to show, or null once it's made. */
  onCreate: (kind: Kind, path: string) => Promise<string | null>;
}

const iconButton = (on: boolean) =>
  `p-1 rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
    on ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
  }`;

/** The file tree's header: New file and New folder, each opening a name box. */
export function NewEntry({ folder, onCreate }: NewEntryProps) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = (next: Kind) => {
    if (kind === next) return setKind(null);
    setKind(next);
    setPath(folder ? `${folder}/` : "");
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind || busy) return;
    const clean = cleanPath(path);
    // "src/" names a folder, not a file.
    if (!clean || (kind === "file" && clean.endsWith("/"))) {
      setError(`Type a name for the new ${kind}.`);
      return;
    }
    setBusy(true);
    const problem = await onCreate(kind, clean);
    setBusy(false);
    if (problem) setError(problem);
    else setKind(null);
  };

  return (
    <div className="border-b border-neutral-800">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-medium text-neutral-500 select-none">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="New file"
            aria-expanded={kind === "file"}
            title="New file"
            onClick={() => begin("file")}
            className={iconButton(kind === "file")}
          >
            <FilePlus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="New folder"
            aria-expanded={kind === "folder"}
            title="New folder"
            onClick={() => begin("folder")}
            className={iconButton(kind === "folder")}
          >
            <FolderPlus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {kind && (
        // A key per kind: switching New file ↔ New folder mounts a new box, so it takes focus.
        <form key={kind} onSubmit={(e) => void submit(e)} className="px-2 pb-2">
          <input
            aria-label={kind === "file" ? "New file name" : "New folder name"}
            aria-describedby="new-entry-hint"
            autoFocus
            spellCheck={false}
            value={path}
            disabled={busy}
            onFocus={(e) => e.currentTarget.setSelectionRange(path.length, path.length)}
            onChange={(e) => {
              setPath(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setKind(null);
            }}
            placeholder={kind === "file" ? "name.ts or src/name.ts" : "name or src/name"}
            className="w-full px-2 py-1 text-xs font-mono rounded bg-neutral-950 border border-neutral-700 text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none"
          />
          {error ? (
            <p role="alert" className="mt-1 text-[11px] text-red-400">
              {error}
            </p>
          ) : (
            <p id="new-entry-hint" className="mt-1 text-[11px] text-neutral-500">
              Enter to create, Esc to cancel. Missing folders are made too.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
