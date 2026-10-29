import { create } from "zustand";
import type { ApplyTarget } from "../chat/store";
import {
  commands,
  type DirEntry,
  type LineEnding,
  type WorkspaceInfo,
} from "../../lib/bindings";
import { applyProposal } from "./applyProposal";
import { buffers } from "./buffers";
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
  setActive(path: string): void;
  save(path: string, options?: { overwrite?: boolean }): Promise<void>;
  reload(path: string): Promise<void>;
  closeTab(path: string): void;

  propose(target: ApplyTarget, code: string): Promise<void>;
  acceptProposal(): Promise<void>;
  confirmGit(): Promise<void>;
  rejectProposal(): void;

  saveAll(): Promise<void>;
  discardAndProceed(): Promise<void>;
  cancelPrompt(): void;
}

function syncUnsaved(tabs: Tab[]) {
  void commands.setUnsaved(tabs.some((t) => t.dirty));
}

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
    const res = await commands.openFolder();
    if (res.status === "ok") {
      if (res.data === null) {
        return;
      }
      set({
        info: res.data,
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
      });
      syncUnsaved([]);
      const listRes = await commands.listDir("");
      if (listRes.status === "ok") {
        set({ children: { "": listRes.data } });
      }
      void get().loadRecent();
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
    const res = await commands.openRecent(path);
    if (res.status === "ok") {
      set({
        info: res.data,
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
      });
      syncUnsaved([]);
      const listRes = await commands.listDir("");
      if (listRes.status === "ok") {
        set({ children: { "": listRes.data } });
      }
      void get().loadRecent();
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
    await commands.closeFolder();
    buffers.clear();
    set({
      info: null,
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
    });
    syncUnsaved([]);
    void get().loadRecent();
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
      const filename = file.path.split("/").pop() || file.path;
      const state = createState(file.text, filename, {
        onChange: () => {
          const dirty = buffers.isDirty(path);
          get().setDirty(path, dirty);
        },
        onSave: () => {
          void get().save(path);
        },
      });
      buffers.set(path, state);

      const tab: Tab = {
        path: file.path,
        name: filename,
        version: file.version,
        lineEnding: file.lineEnding,
        hasBom: file.hasBom,
        isSecret: file.isSecret,
        dirty: false,
      };

      set((s) => ({
        tabs: [...s.tabs, tab],
        active: file.path,
        error: null,
      }));
    } else {
      set({ error: workspaceErrorText(res.error) });
    }
  },

  setDirty: (path: string, dirty: boolean) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.path === path ? { ...t, dirty } : t,
      );
      syncUnsaved(nextTabs);
      return { tabs: nextTabs };
    });
  },

  setActive: (path: string) => {
    set({ active: path });
  },

  save: async (path: string, options?: { overwrite?: boolean }) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;

    const currentText = buffers.text(path) ?? "";
    const expectedVersion = options?.overwrite ? null : tab.version;

    const res = await commands.writeFile({
      path,
      text: currentText,
      lineEnding: tab.lineEnding,
      hasBom: tab.hasBom,
      expectedVersion,
    });

    if (res.status === "ok") {
      const newVersion = res.data;
      buffers.markSaved(path);
      const nextTabs = get().tabs.map((t) =>
        t.path === path ? { ...t, version: newVersion, dirty: false } : t,
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
    const res = await commands.readFile(path);
    if (res.status === "ok") {
      const file = res.data;
      const filename = file.path.split("/").pop() || file.path;
      const state = createState(file.text, filename, {
        onChange: () => {
          const dirty = buffers.isDirty(path);
          get().setDirty(path, dirty);
        },
        onSave: () => {
          void get().save(path);
        },
      });
      buffers.set(path, state);
      buffers.markSaved(path);

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

  propose: async (target: ApplyTarget, code: string) => {
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
    const doc = buffers.text(tab.path) ?? "";
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
    const newState = createState(proposal.proposed, tab.name, {
      onChange: () => {
        get().setDirty(tab.path, buffers.isDirty(tab.path));
      },
      onSave: () => {
        void get().save(tab.path);
      },
    });
    buffers.set(tab.path, newState);
    buffers.markSaved(tab.path);

    const nextTabs = get().tabs.map((t) =>
      t.path === proposal.path
        ? { ...t, version: newVersion, dirty: false }
        : t,
    );
    set({
      tabs: nextTabs,
      proposal: null,
      needsGitConfirm: false,
      conflict: null,
      error: null,
    });
    syncUnsaved(nextTabs);
  },

  confirmGit: async () => {
    set({ gitWarned: true, needsGitConfirm: false });
    await get().acceptProposal();
  },

  rejectProposal: () => {
    set({ proposal: null, needsGitConfirm: false });
  },

  saveAll: async () => {
    for (const tab of get().tabs) {
      if (tab.dirty) {
        await get().save(tab.path);
      }
    }
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
