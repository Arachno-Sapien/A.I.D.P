import type { EditorState, Text } from "@codemirror/state";

interface BufferEntry {
  state: EditorState;
  savedDoc: Text;
}

export interface SelectionInfo {
  text: string;
  fromLine: number;
  toLine: number;
}

const map = new Map<string, BufferEntry>();

export const buffers = {
  get(path: string): EditorState | undefined {
    return map.get(path)?.state;
  },

  /** A buffer loaded from disk: its text counts as saved. */
  open(path: string, state: EditorState): void {
    map.set(path, { state, savedDoc: state.doc });
  },

  /** The editor's latest state; the saved text stays as it was. */
  set(path: string, state: EditorState): void {
    const existing = map.get(path);
    if (existing) {
      existing.state = state;
    } else {
      map.set(path, { state, savedDoc: state.doc });
    }
  },

  remove(path: string): void {
    map.delete(path);
  },

  text(path: string): string | undefined {
    return map.get(path)?.state.doc.toString();
  },

  selection(path: string): SelectionInfo | null {
    const state = map.get(path)?.state;
    if (!state) return null;
    const sel = state.selection.main;
    if (sel.empty) return null;
    const text = state.sliceDoc(sel.from, sel.to);
    const fromLine = state.doc.lineAt(sel.from).number;
    const toLine = state.doc.lineAt(sel.to).number;
    return { text, fromLine, toLine };
  },

  isDirty(path: string): boolean {
    const entry = map.get(path);
    if (!entry) return false;
    return !entry.savedDoc.eq(entry.state.doc);
  },

  /** Pass the text that was written; edits made since then stay unsaved. */
  markSaved(path: string, doc?: Text): void {
    const entry = map.get(path);
    if (entry) {
      entry.savedDoc = doc ?? entry.state.doc;
    }
  },

  clear(): void {
    map.clear();
  },
};

