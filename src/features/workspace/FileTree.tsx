import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { DirEntry } from "../../lib/bindings";
import { observeRectOrInitial } from "../../lib/virtual";
import { flattenTree } from "./tree";

export interface FileTreeProps {
  childrenMap: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** The entry being renamed in place, if any. */
  renaming?: string | null;
  onRename?: (path: string, name: string) => void;
  onRenameCancel?: () => void;
  /** Right-click or the menu key, on an entry or (null) on the space below the rows. */
  onMenu?: (entry: DirEntry | null, x: number, y: number) => void;
  /** F2 on a row. */
  onStartRename?: (entry: DirEntry) => void;
  /** Delete on a row. */
  onDelete?: (entry: DirEntry) => void;
  /** An entry dragged onto a folder ("" is the top). */
  onMove?: (from: string, toFolder: string) => void;
}

const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));

/** The pointer moves this far with the button held before a drag starts. */
const DRAG_PX = 5;

/**
 * The folder a drop at (x, y) lands in: a folder row, a file row's folder, or
 * the top for the space below the rows. Null where `from` can't go: outside the
 * tree, the folder it's already in, or (for a folder) itself and what's inside.
 */
function dropFolder(tree: HTMLElement | null, x: number, y: number, from: DirEntry): string | null {
  const under = document.elementFromPoint(x, y);
  if (!tree || !under || !tree.contains(under)) return null;
  const row = under.closest<HTMLElement>("[data-tree-row]");
  const rowPath = row?.dataset.path ?? "";
  const folder = row ? (row.dataset.dir ? rowPath : parentOf(rowPath)) : "";
  if (folder === parentOf(from.path)) return null;
  if (from.isDir && (folder === from.path || folder.startsWith(`${from.path}/`))) return null;
  return folder;
}

// Tauri takes HTML drag-and-drop for files dropped from the OS (attachments),
// so moving in the tree follows the mouse instead.
export function FileTree({
  childrenMap,
  expanded,
  onToggleDir,
  onOpenFile,
  renaming = null,
  onRename,
  onRenameCancel,
  onMenu,
  onStartRename,
  onDelete,
  onMove,
}: FileTreeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const items = flattenTree(childrenMap, expanded);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
    initialRect: { width: 280, height: 600 },
    observeElementRect: observeRectOrInitial,
  });

  const [drag, setDrag] = useState<{ name: string; x: number; y: number; target: string | null } | null>(null);
  const pressed = useRef<{ entry: DirEntry; x: number; y: number; moving: boolean } | null>(null);
  const justDragged = useRef(false);
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const p = pressed.current;
      if (!p) return;
      if (!p.moving) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
        p.moving = true;
      }
      const target = dropFolder(parentRef.current, e.clientX, e.clientY, p.entry);
      setDrag({ name: p.entry.name, x: e.clientX, y: e.clientY, target });
    };
    const onMouseUp = (e: MouseEvent) => {
      const p = pressed.current;
      pressed.current = null;
      if (!p?.moving) return;
      // The release can click the row it started on; that click isn't an open.
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      setDrag(null);
      const target = dropFolder(parentRef.current, e.clientX, e.clientY, p.entry);
      if (target !== null) move.current?.(p.entry.path, target);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pressed.current?.moving) {
        pressed.current = null;
        setDrag(null);
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const activate = (entry: DirEntry) => {
    if (entry.isDir) onToggleDir(entry.path);
    else onOpenFile(entry.path);
  };

  const onRowKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, entry: DirEntry) => {
    if (e.target !== e.currentTarget) return; // keys typed in the rename box are its own
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(entry);
    } else if (e.key === "F2") {
      e.preventDefault();
      onStartRename?.(entry);
    } else if (e.key === "Delete") {
      e.preventDefault();
      onDelete?.(entry);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      onMenu?.(entry, box.left + 16, box.bottom);
    }
  };

  return (
    <div
      ref={parentRef}
      data-file-tree
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu?.(null, e.clientX, e.clientY);
      }}
      className={`h-full overflow-y-auto select-none text-xs font-mono ${
        drag?.target === "" ? "ring-1 ring-inset ring-accent" : ""
      }`}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const { entry } = item;
          const isExpanded = entry.isDir && Boolean(expanded[entry.path]);
          const isRenaming = renaming === entry.path;
          const isTarget = entry.isDir && drag?.target === entry.path;

          return (
            <div
              key={entry.path}
              data-tree-row
              data-path={entry.path}
              data-dir={entry.isDir || undefined}
              data-drop-target={isTarget || undefined}
              // A row is a button, except while it holds the rename box.
              role={isRenaming ? undefined : "button"}
              aria-expanded={entry.isDir && !isRenaming ? isExpanded : undefined}
              tabIndex={0}
              onClick={() => {
                if (!justDragged.current) activate(entry);
              }}
              onKeyDown={(e) => onRowKeyDown(e, entry)}
              onMouseDown={(e) => {
                if (e.button === 0) pressed.current = { entry, x: e.clientX, y: e.clientY, moving: false };
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMenu?.(entry, e.clientX, e.clientY);
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                paddingLeft: `${item.depth * 14 + 8}px`,
              }}
              className={`flex items-center gap-1.5 cursor-pointer text-neutral-300 hover:text-neutral-100 truncate pr-2 focus-visible:outline-none focus-visible:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-500 ${
                isTarget ? "bg-accent/20 ring-1 ring-inset ring-accent" : "hover:bg-neutral-800/80"
              }`}
            >
              <span className="text-neutral-500 w-3 text-center">
                {entry.isDir ? (isExpanded ? "▾" : "▸") : " "}
              </span>
              {isRenaming ? (
                <RenameBox
                  name={entry.name}
                  onDone={(name) => (name === null ? onRenameCancel?.() : onRename?.(entry.path, name))}
                />
              ) : (
                <span className="truncate">{entry.name}</span>
              )}
            </div>
          );
        })}
      </div>
      {drag &&
        createPortal(
          <div
            data-drag-label
            aria-hidden="true"
            style={{ position: "fixed", left: drag.x + 12, top: drag.y + 8 }}
            className={`pointer-events-none z-50 px-2 py-0.5 rounded border text-xs font-mono shadow-lg ${
              drag.target === null
                ? "bg-neutral-900 border-neutral-700 text-neutral-500"
                : "bg-neutral-800 border-neutral-600 text-neutral-100"
            }`}
          >
            {drag.name}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The rename box in a row: the name before its extension starts selected.
 * Enter or leaving it keeps the new name; Escape, or no change, cancels.
 */
function RenameBox({ name, onDone }: { name: string; onDone(name: string | null): void }) {
  const [value, setValue] = useState(name);
  const finished = useRef(false);

  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    onDone(keep && next && next !== name ? next : null);
  };

  return (
    <input
      aria-label={`New name for ${name}`}
      autoFocus
      spellCheck={false}
      value={value}
      onFocus={(e) => {
        const dot = name.lastIndexOf(".");
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : name.length);
      }}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") {
          // Back to the row, so the keyboard keeps its place.
          const row = e.currentTarget.closest<HTMLElement>("[data-tree-row]");
          finish(false);
          row?.focus();
        }
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 px-1 text-xs font-mono rounded bg-neutral-950 border border-neutral-500 text-neutral-100 focus:outline-none"
    />
  );
}
