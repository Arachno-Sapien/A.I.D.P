import { create } from "zustand";
import type { ApplyTarget } from "../chat/store";
import {
  commands,
  type DirEntry,
  type LineEnding,
  type WorkspaceInfo,
} from "../../lib/bindings";
import { applyProposal } from "./applyProposal";
import { buffers, type SelectionInfo } from "./buffers";
import { useWorkspaceChatStore } from "./chatStore";
import { createState, loadLanguage } from "./cm";
import { workspaceErrorText } from "./workspaceErrorText";

export interface Tab {
  path: string;
  name: string;
  version: string;
  lineEnding: LineEnding;
  hasBom: boolean;
  isSecret: boolean;
  dirty: boolean;
}

export interface Conflict {
  path: string;
  kind: "changedOnDisk" | "deleted";
}

export interface Proposal {
  path: string;
  original: string;
  proposed: string;
  toolId?: number;
}

/** A file the agent wrote without asking, kept for the review at the end (decision 0028). */
export interface ReviewFile {
  path: string;
  /** The text before the agent's first write; null for a file it created. */
  original: string | null;
  /** The text after its last write. */
  current: string;
}

export type DirtyPromptAction =
  | "open"
  | "close"
  | { type: "recent"; path: string }
  | null;

export interface WorkspaceStore {
  info: WorkspaceInfo | null;
  recent: string[];
  children: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  error: string | null;

  tabs: Tab[];
  active: string | null;
  conflict: Conflict | null;
  proposal: Proposal | null;
  gitWarned: boolean;
  needsGitConfirm: boolean;
  dirtyPrompt: DirtyPromptAction;
  /** The editor selection, kept here so the AI panel re-renders when it changes. */
  selection: { path: string; info: SelectionInfo } | null;
  /** Bumped when the store replaces a buffer (reload, Accept), so the open editor shows it. */
  revision: number;
  /** The agent writes edits without asking; they are reviewed when it finishes. */
  reviewAtEnd: boolean;
  /** Commands run without asking for the next task only (decision 0030). */
  runCommands: boolean;
  /** What the agent wrote without asking, one entry per file. */
  review: ReviewFile[];
  /** The review file whose diff is shown in place of the editor. */
  reviewDiff: string | null;

  loadRecent(): Promise<void>;
  openFolder(): Promise<void>;
  forceOpenFolder(): Promise<void>;
  openRecent(path: string): Promise<void>;
  forceOpenRecent(path: string): Promise<void>;
  closeFolder(): Promise<void>;
  forceCloseFolder(): Promise<void>;
  toggleDir(path: string): Promise<void>;
  refreshTree(): Promise<void>;
  /** New file or folder from the tree: the message to show, or null once it's made and shown. */
  create(kind: "file" | "folder", path: string): Promise<string | null>;
  /** Rename or move (drag) a file or folder: the message to show, or null once done. */
  move(from: string, to: string): Promise<string | null>;
  /** Delete to the Recycle Bin or Trash: the message to show, or null once done. */
  remove(path: string): Promise<string | null>;
  /** Why `path` can't be renamed, moved or deleted right now, or null if it can. */
  blocked(path: string): string | null;
  clearError(): void;

  openFile(path: string): Promise<void>;
  setDirty(path: string, dirty: boolean): void;
  noteSelection(path: string): void;
  setActive(path: string): void;
  save(path: string, options?: { overwrite?: boolean }): Promise<void>;
  reload(path: string): Promise<void>;
  reloadIfClean(path: string): Promise<void>;
  closeTab(path: string): void;

  showToolProposal(
    toolId: number,
    path: string,
    original: string,
    proposed: string,
  ): void;
  propose(target: ApplyTarget, code: string): Promise<void>;
  acceptProposal(): Promise<void>;
  confirmGit(): Promise<void>;
  rejectProposal(): void;

  setReviewAtEnd(on: boolean): void;
  setRunCommands(on: boolean): void;
  /** Adds a write the agent made without asking to the review. */
  noteAgentWrite(path: string, before: string | null, after: string): void;
  showReviewDiff(path: string | null): void;
  /** Puts one file back as it was before the agent: the message to show, or null once done. */
  undoReview(path: string): Promise<string | null>;
  /** Undoes every file it can: the messages for the rest, or null. */
  undoAll(): Promise<string | null>;
  keepReview(): void;

  /** Saves every dirty tab; true only when nothing is left unsaved. */
  saveAll(): Promise<boolean>;
  discardAndProceed(): Promise<void>;
  cancelPrompt(): void;
}

/** Whether a path is `base` or inside it ("src" holds "src/a.ts", not "src2"). */
const within = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);

/** Every folder above a path: "a/b/c.ts" → ["a", "a/b"]. */
function foldersAbove(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Renaming, moving or deleting must not lose unsaved text or a change waiting for an answer. */
function blockedBy(tabs: Tab[], proposal: Proposal | null, path: string): string | null {
  const inside = within(path);
  const dirty = tabs.find((t) => t.dirty && inside(t.path));
  if (dirty) return `Save or close ${dirty.name} first: it has unsaved changes.`;
  if (proposal && inside(proposal.path)) {
    return `Accept or reject the proposed change to ${proposal.path.split("/").pop()} first.`;
  }
  return null;
}

function syncUnsaved(tabs: Tab[]) {
  void commands.setUnsaved(tabs.some((t) => t.dirty));
}

function sameSelection(a: SelectionInfo | null, b: SelectionInfo | null) {
  if (a === null || b === null) return a === b;
  return a.text === b.text && a.fromLine === b.fromLine && a.toLine === b.toLine;
}

// Every editor state writes itself back into `buffers`, which is what Save,
// the AI context and tab switching read. The file's language is loaded first,
// or the editor shows it as plain, uncoloured text.
async function editorState(path: string, text: string, filename: string) {
  await loadLanguage(filename);
  return createState(text, filename, {
    onUpdate: (state, docChanged) => {
      buffers.set(path, state);
      const store = useWorkspaceStore.getState();
      if (docChanged) store.setDirty(path, buffers.isDirty(path));
      store.noteSelection(path);
    },
    onSave: () => {
      void useWorkspaceStore.getState().save(path);
    },
  });
}

/** Text with CRLF read as LF: the agent's text and a file read back differ only there. */
const lf = (text: string) => text.replace(/\r\n/g, "\n");

// Saves of one file run one after another: each needs the version the one
// before it wrote, or it looks like a change on disk.
const saves = new Map<string, Promise<void>>();

const folderReset = {
  children: {},
  expanded: {},
  error: null,
  proposal: null,
  gitWarned: false,
  needsGitConfirm: false,
  tabs: [],
  active: null,
  conflict: null,
  dirtyPrompt: null,
  selection: null,
  // A new folder may have no git, and its warning comes before the switch is on.
  reviewAtEnd: false,
  runCommands: false,
  review: [],
  reviewDiff: null,
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  info: null,
  recent: [],
  children: {},
  expanded: {},
  error: null,

  tabs: [],
  active: null,
  conflict: null,
  proposal: null,
  gitWarned: false,
  needsGitConfirm: false,
  dirtyPrompt: null,
  selection: null,
  revision: 0,
  reviewAtEnd: false,
  runCommands: false,
  review: [],
  reviewDiff: null,

  loadRecent: async () => {
    const res = await commands.recentFolders();
    if (res.status === "ok") {
      set({ recent: res.data });
    }
  },

  openFolder: async () => {
    if (get().tabs.some((t) => t.dirty)) {
      set({ dirtyPrompt: "open" });
      return;
    }
    await get().forceOpenFolder();
  },

  forceOpenFolder: async () => {
    await commands.stopReply("workspace");
    const res = await commands.openFolder();
    if (res.status === "ok") {
      if (res.data === null) {
        return;
      }
      buffers.clear();
      set({ info: res.data, ...folderReset });
      syncUnsaved([]);
      const listRes = await commands.listDir("");
      if (listRes.status === "ok") {
        set({ children: { "": listRes.data } });
      }
      void get().loadRecent();
      await useWorkspaceChatStore.getState().openPlace(res.data.path);
    } else {
      set({ error: workspaceErrorText(res.error) });
    }
  },

  openRecent: async (path: string) => {
    if (get().tabs.some((t) => t.dirty)) {
      set({ dirtyPrompt: { type: "recent", path } });
      return;
    }
    await get().forceOpenRecent(path);
  },

  forceOpenRecent: async (path: string) => {
    await commands.stopReply("workspace");
    const res = await commands.openRecent(path);
    if (res.status === "ok") {
      buffers.clear();
      set({ info: res.data, ...folderReset });
      syncUnsaved([]);
      const listRes = await commands.listDir("");
      if (listRes.status === "ok") {
        set({ children: { "": listRes.data } });
      }
      void get().loadRecent();
      await useWorkspaceChatStore.getState().openPlace(res.data.path);
    } else {
      set({ error: workspaceErrorText(res.error) });
      void get().loadRecent();
    }
  },

  closeFolder: async () => {
    if (get().tabs.some((t) => t.dirty)) {
      set({ dirtyPrompt: "close" });
      return;
    }
    await get().forceCloseFolder();
  },

  forceCloseFolder: async () => {
    await commands.stopReply("workspace");
    await commands.closeFolder();
    buffers.clear();
    set({ info: null, ...folderReset });
    syncUnsaved([]);
    void get().loadRecent();
    useWorkspaceChatStore.getState().startNew();
    useWorkspaceChatStore.setState({ place: null });
  },

  toggleDir: async (path: string) => {
    if (get().expanded[path]) {
      const copy = { ...get().expanded };
      delete copy[path];
      set({ expanded: copy });
    } else {
      if (!get().children[path]) {
        const res = await commands.listDir(path);
        if (res.status === "ok") {
          set((state) => ({
            children: { ...state.children, [path]: res.data },
            expanded: { ...state.expanded, [path]: true },
          }));
        } else {
          set({ error: workspaceErrorText(res.error) });
        }
      } else {
        set((state) => ({
          expanded: { ...state.expanded, [path]: true },
        }));
      }
    }
  },

  refreshTree: async () => {
    const paths = ["", ...Object.keys(get().expanded)];
    const listed = await Promise.all(paths.map((folder) => commands.listDir(folder)));
    // Merged into what is there now: a folder opened meanwhile keeps its listing.
    set((state) => {
      const children = { ...state.children };
      listed.forEach((res, i) => {
        if (res.status === "ok") children[paths[i]!] = res.data;
      });
      return { children };
    });
  },

  create: async (kind, path) => {
    const res = kind === "file" ? await commands.newFile(path) : await commands.newFolder(path);
    if (res.status === "error") return workspaceErrorText(res.error);
    // Open every folder down to it (a new folder too), then list them again.
    const parts = res.data.split("/");
    const expanded = { ...get().expanded };
    for (let i = 1; i <= (kind === "file" ? parts.length - 1 : parts.length); i++) {
      expanded[parts.slice(0, i).join("/")] = true;
    }
    set({ expanded });
    await get().refreshTree();
    if (kind === "file") await get().openFile(res.data);
    return null;
  },

  move: async (from, to) => {
    const blocked = blockedBy(get().tabs, get().proposal, from);
    if (blocked) return blocked;
    const res = await commands.renameEntry(from, to);
    if (res.status === "error") return workspaceErrorText(res.error);
    const moved = res.data;
    if (moved === from) return null;

    const inside = within(from);
    const renamed = (path: string) => moved + path.slice(from.length);
    const { active } = get();
    // Tabs close and reopen at the new path (they were saved, so nothing is lost).
    const carried = get().tabs.filter((t) => inside(t.path));
    for (const t of carried) get().closeTab(t.path);

    const expanded: Record<string, true> = {};
    for (const folder of Object.keys(get().expanded)) {
      expanded[inside(folder) ? renamed(folder) : folder] = true;
    }
    for (const folder of foldersAbove(moved)) expanded[folder] = true;
    const children = Object.fromEntries(
      Object.entries(get().children).filter(([folder]) => !inside(folder)),
    );
    set({ expanded, children });
    await get().refreshTree();

    for (const t of carried) await get().openFile(renamed(t.path));
    // Opening makes a tab active; the one that was active stays so.
    set({ active: active && inside(active) ? renamed(active) : active });
    return null;
  },

  blocked: (path) => blockedBy(get().tabs, get().proposal, path),

  remove: async (path) => {
    const blocked = blockedBy(get().tabs, get().proposal, path);
    if (blocked) return blocked;
    const res = await commands.deleteEntry(path);
    if (res.status === "error") return workspaceErrorText(res.error);

    const inside = within(path);
    for (const t of get().tabs.filter((t) => inside(t.path))) get().closeTab(t.path);
    const keep = <T,>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([folder]) => !inside(folder)));
    set({ expanded: keep(get().expanded), children: keep(get().children) });
    await get().refreshTree();
    return null;
  },

  clearError: () => set({ error: null }),

  openFile: async (path: string) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ active: path });
      return;
    }

    const res = await commands.readFile(path);
    if (res.status === "ok") {
      const file = res.data;
      // The tab and its buffer use the path that was asked for. Rust may answer
      // with the link target's path, and two keys for one tab lose its text.
      const filename = path.split("/").pop() || path;
      const state = await editorState(path, file.text, filename);
      // A second open of the same file (a double-click) may have finished first.
      if (get().tabs.some((t) => t.path === path)) {
        set({ active: path });
        return;
      }
      buffers.open(path, state);

      const tab: Tab = {
        path,
        name: filename,
        version: file.version,
        lineEnding: file.lineEnding,
        hasBom: file.hasBom,
        isSecret: file.isSecret,
        dirty: false,
      };

      set((s) => ({
        tabs: [...s.tabs, tab],
        active: path,
        error: null,
      }));
    } else {
      set({ error: workspaceErrorText(res.error) });
    }
  },

  setDirty: (path: string, dirty: boolean) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab || tab.dirty === dirty) return;
    const nextTabs = get().tabs.map((t) =>
      t.path === path ? { ...t, dirty } : t,
    );
    set({ tabs: nextTabs });
    syncUnsaved(nextTabs);
  },

  noteSelection: (path: string) => {
    const info = buffers.selection(path);
    const current = get().selection;
    const currentInfo = current?.path === path ? current.info : null;
    if (sameSelection(currentInfo, info)) return;
    set({ selection: info ? { path, info } : null });
  },

  setActive: (path: string) => {
    set({ active: path });
  },

  save: async (path: string, options?: { overwrite?: boolean }) => {
    const earlier = saves.get(path);
    // With nothing ahead of it, the text is read now, not a tick later.
    const run = earlier
      ? earlier.catch(() => undefined).then(() => writeTab(path, options))
      : writeTab(path, options);
    saves.set(path, run);
    try {
      await run;
    } finally {
      if (saves.get(path) === run) saves.delete(path);
    }
  },

  reload: async (path: string) => {
    const tab = get().tabs.find((t) => t.path === path);
    const res = await commands.readFile(path);
    if (res.status === "ok") {
      const file = res.data;
      const filename = tab?.name ?? (path.split("/").pop() || path);
      buffers.open(path, await editorState(path, file.text, filename));

      const nextTabs = get().tabs.map((t) =>
        t.path === path
          ? {
              ...t,
              version: file.version,
              lineEnding: file.lineEnding,
              hasBom: file.hasBom,
              isSecret: file.isSecret,
              dirty: false,
            }
          : t,
      );
      set((s) => ({
        tabs: nextTabs,
        conflict: s.conflict?.path === path ? null : s.conflict,
        error: null,
        revision: s.revision + 1,
      }));
      syncUnsaved(nextTabs);
    } else {
      if (res.error.kind === "notFound") {
        set({ conflict: { path, kind: "deleted" } });
      } else {
        set({ error: workspaceErrorText(res.error) });
      }
    }
  },

  reloadIfClean: async (path: string) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab || tab.dirty) {
      return;
    }
    await get().reload(path);
  },

  closeTab: (path: string) => {
    buffers.remove(path);
    const remaining = get().tabs.filter((t) => t.path !== path);
    let nextActive = get().active;
    if (nextActive === path) {
      nextActive =
        remaining.length > 0 ? remaining[remaining.length - 1]!.path : null;
    }
    set((s) => ({
      tabs: remaining,
      active: nextActive,
      conflict: s.conflict?.path === path ? null : s.conflict,
    }));
    syncUnsaved(remaining);
  },

  showToolProposal: (
    toolId: number,
    path: string,
    original: string,
    proposed: string,
  ) => {
    set({
      proposal: { toolId, path, original, proposed },
      error: null,
    });
  },

  propose: async (target: ApplyTarget, code: string) => {
    if (get().proposal?.toolId !== undefined) {
      set({ error: "Answer the proposed change first." });
      return;
    }

    let tab = get().tabs.find((t) => t.path === target.path);
    if (!tab) {
      await get().openFile(target.path);
      tab = get().tabs.find((t) => t.path === target.path);
    }
    if (!tab) {
      return;
    }
    if (tab.dirty) {
      set({
        error: `Cannot apply changes to ${tab.name} because it has unsaved edits. Save or discard them first.`,
        proposal: null,
      });
      return;
    }
    const doc = buffers.text(tab.path);
    if (doc === undefined) {
      set({ error: `The text of ${tab.name} is not loaded. Reopen the file.` });
      return;
    }
    const res = applyProposal(doc, target.selection, code);
    if (!res.ok) {
      const msg =
        res.reason === "selectionChanged"
          ? `The selected code in ${tab.name} has changed.`
          : `The selected code in ${tab.name} is ambiguous.`;
      set({ error: msg, proposal: null });
      return;
    }
    set({
      proposal: {
        path: tab.path,
        original: doc,
        proposed: res.text,
      },
      error: null,
    });
  },

  acceptProposal: async () => {
    const { proposal, info, gitWarned, tabs } = get();
    if (!proposal) return;

    if (info && !info.isGit && !gitWarned) {
      set({ needsGitConfirm: true });
      return;
    }

    if (proposal.toolId !== undefined) {
      await commands.answerTool(proposal.toolId, true);
      set({ proposal: null, needsGitConfirm: false, error: null });
      return;
    }

    const tab = tabs.find((t) => t.path === proposal.path);
    if (!tab) return;

    const res = await commands.writeFile({
      path: proposal.path,
      text: proposal.proposed,
      lineEnding: tab.lineEnding,
      hasBom: tab.hasBom,
      expectedVersion: tab.version,
    });

    if (res.status === "error") {
      if (res.error.kind === "changedOnDisk") {
        set({ conflict: { path: proposal.path, kind: "changedOnDisk" } });
      } else if (res.error.kind === "notFound") {
        set({ conflict: { path: proposal.path, kind: "deleted" } });
      } else {
        set({ error: workspaceErrorText(res.error) });
      }
      return;
    }

    const newVersion = res.data;
    buffers.open(
      tab.path,
      await editorState(tab.path, proposal.proposed, tab.name),
    );

    const nextTabs = get().tabs.map((t) =>
      t.path === proposal.path
        ? { ...t, version: newVersion, dirty: false }
        : t,
    );
    set((s) => ({
      tabs: nextTabs,
      proposal: null,
      needsGitConfirm: false,
      conflict: null,
      error: null,
      revision: s.revision + 1,
    }));
    syncUnsaved(nextTabs);
  },

  confirmGit: async () => {
    set({ gitWarned: true, needsGitConfirm: false });
    await get().acceptProposal();
  },

  rejectProposal: () => {
    const { proposal } = get();
    if (proposal?.toolId !== undefined) {
      void commands.answerTool(proposal.toolId, false);
    }
    set({ proposal: null, needsGitConfirm: false });
  },

  setReviewAtEnd: (on) => set({ reviewAtEnd: on }),
  setRunCommands: (on) => set({ runCommands: on }),

  noteAgentWrite: (path, before, after) => {
    const review = get().review;
    const known = review.find((f) => f.path === path);
    set({
      review: known
        ? review.map((f) => (f.path === path ? { ...f, current: after } : f))
        : [...review, { path, original: before, current: after }],
    });
  },

  showReviewDiff: (path) => set({ reviewDiff: path }),

  undoReview: async (path) => {
    const file = get().review.find((f) => f.path === path);
    if (!file) return null;
    const blocked = blockedBy(get().tabs, get().proposal, path);
    if (blocked) return blocked;

    const res = await commands.readFile(path);
    if (res.status === "error") return workspaceErrorText(res.error);
    // Only the agent's own text is put back: anything since then is someone's work.
    if (lf(res.data.text) !== lf(file.current)) {
      return `${path} changed after the agent wrote it, so it was left as it is.`;
    }

    if (file.original === null) {
      const message = await get().remove(path);
      if (message) return message;
    } else {
      const written = await commands.writeFile({
        path,
        text: file.original,
        lineEnding: res.data.lineEnding,
        hasBom: res.data.hasBom,
        expectedVersion: res.data.version,
      });
      if (written.status === "error") return workspaceErrorText(written.error);
      await get().reloadIfClean(path);
    }
    set((s) => ({
      review: s.review.filter((f) => f.path !== path),
      reviewDiff: s.reviewDiff === path ? null : s.reviewDiff,
    }));
    return null;
  },

  undoAll: async () => {
    const messages: string[] = [];
    for (const { path } of get().review) {
      const message = await get().undoReview(path);
      if (message) messages.push(message);
    }
    return messages.length > 0 ? messages.join("\n") : null;
  },

  keepReview: () => set({ review: [], reviewDiff: null }),

  saveAll: async () => {
    for (const tab of get().tabs) {
      if (tab.dirty) {
        await get().save(tab.path);
      }
    }
    return !get().tabs.some((t) => t.dirty);
  },

  discardAndProceed: async () => {
    const action = get().dirtyPrompt;
    set({ dirtyPrompt: null });
    if (action === "open") {
      await get().forceOpenFolder();
    } else if (action === "close") {
      await get().forceCloseFolder();
    } else if (
      action &&
      typeof action === "object" &&
      action.type === "recent"
    ) {
      await get().forceOpenRecent(action.path);
    }
  },

  cancelPrompt: () => {
    set({ dirtyPrompt: null });
  },
}));

/** Writes a tab's text to its file; `save` runs these one at a time per file. */
async function writeTab(path: string, options?: { overwrite?: boolean }) {
  const { getState: get, setState: set } = useWorkspaceStore;
  const tab = get().tabs.find((t) => t.path === path);
  if (!tab) return;

  const state = buffers.get(path);
  if (!state) {
    set({
      error: `The text of ${tab.name} is not loaded, so nothing was written. Copy your changes, then reopen the file.`,
    });
    return;
  }
  const written = state.doc;
  const expectedVersion = options?.overwrite ? null : tab.version;

  const res = await commands.writeFile({
    path,
    text: written.toString(),
    lineEnding: tab.lineEnding,
    hasBom: tab.hasBom,
    expectedVersion,
  });

  if (res.status === "ok") {
    const newVersion = res.data;
    buffers.markSaved(path, written);
    // Still dirty if the user typed while the file was being written.
    const dirty = buffers.isDirty(path);
    const nextTabs = get().tabs.map((t) =>
      t.path === path ? { ...t, version: newVersion, dirty } : t,
    );
    set((s) => ({
      tabs: nextTabs,
      conflict: s.conflict?.path === path ? null : s.conflict,
      error: null,
    }));
    syncUnsaved(nextTabs);
  } else {
    if (res.error.kind === "changedOnDisk") {
      set({ conflict: { path, kind: "changedOnDisk" } });
    } else if (res.error.kind === "notFound") {
      set({ conflict: { path, kind: "deleted" } });
    } else {
      set({ error: workspaceErrorText(res.error) });
    }
  }
}
