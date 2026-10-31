import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { DirEntry } from "../../lib/bindings";
import { observeRectOrInitial } from "../../lib/virtual";
import { flattenTree } from "./tree";

export interface FileTreeProps {
  childrenMap: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export function FileTree({
  childrenMap,
  expanded,
  onToggleDir,
  onOpenFile,
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

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto select-none text-xs font-mono"
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

          const isExpanded =
            item.entry.isDir && Boolean(expanded[item.entry.path]);

          return (
            <div
              key={item.entry.path}
              data-tree-row
              onClick={() => {
                if (item.entry.isDir) {
                  onToggleDir(item.entry.path);
                } else {
                  onOpenFile(item.entry.path);
                }
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
              className="flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800/80 text-neutral-300 hover:text-neutral-100 truncate pr-2"
            >
              <span className="text-neutral-500 w-3 text-center">
                {item.entry.isDir ? (isExpanded ? "▾" : "▸") : " "}
              </span>
              <span className="truncate">{item.entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
