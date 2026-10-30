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
import { createState } from "./cm";
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

  loadRecent(): Promise<void>;
  openFolder(): Promise<void>;
  forceOpenFolder(): Promise<void>;
  openRecent(path: string): Promise<void>;
  forceOpenRecent(path: string): Promise<void>;
  closeFolder(): Promise<void>;
  forceCloseFolder(): Promise<void>;
  toggleDir(path: string): Promise<void>;
  refreshTree(): Promise<void>;
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

  /** Saves every dirty tab; true only when nothing is left unsaved. */
  saveAll(): Promise<boolean>;
  discardAndProceed(): Promise<void>;
  cancelPrompt(): void;
}

function syncUnsaved(tabs: Tab[]) {
  void commands.setUnsaved(tabs.some((t) => t.dirty));
}

function sameSelection(a: SelectionInfo | null, b: SelectionInfo | null) {
  if (a === null || b === null) return a === b;
  return a.text === b.text && a.fromLine === b.fromLine && a.toLine === b.toLine;
}

// Every editor state writes itself back into `buffers`, which is what Save,
// the AI context and tab switching read.
function editorState(path: string, text: string, filename: string) {
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
    const nextChildren = { ...get().children };
    for (const folder of paths) {
      const res = await commands.listDir(folder);
      if (res.status === "ok") {
        nextChildren[folder] = res.data;
      }
    }
    set({ children: nextChildren });
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
      buffers.open(path, editorState(path, file.text, filename));

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
  },

  reload: async (path: string) => {
    const tab = get().tabs.find((t) => t.path === path);
    const res = await commands.readFile(path);
    if (res.status === "ok") {
      const file = res.data;
      const filename = tab?.name ?? (path.split("/").pop() || path);
      buffers.open(path, editorState(path, file.text, filename));

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
    buffers.open(tab.path, editorState(tab.path, proposal.proposed, tab.name));

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
