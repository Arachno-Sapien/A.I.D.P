import type { DirEntry } from "../../lib/bindings";

export interface FlatTreeItem {
  entry: DirEntry;
  depth: number;
}

export function flattenTree(
  children: Record<string, DirEntry[]>,
  expanded: Record<string, true>,
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  function walk(folderPath: string, depth: number) {
    const list = children[folderPath] ?? [];
    for (const entry of list) {
      result.push({ entry, depth });
      if (entry.isDir && expanded[entry.path]) {
        walk(entry.path, depth + 1);
      }
    }
  }

  walk("", 0);
  return result;
}
