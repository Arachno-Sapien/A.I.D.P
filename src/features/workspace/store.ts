import { create } from "zustand";
import {
  commands,
  type DirEntry,
  type LineEnding,
  type WorkspaceInfo,
} from "../../lib/bindings";
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

export interface WorkspaceStore {
  info: WorkspaceInfo | null;
  recent: string[];
  children: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  error: string | null;

  tabs: Tab[];
  active: string | null;
  conflict: Conflict | null;

  loadRecent(): Promise<void>;
  openFolder(): Promise<void>;
  openRecent(path: string): Promise<void>;
  closeFolder(): Promise<void>;
  toggleDir(path: string): Promise<void>;
  refreshTree(): Promise<void>;
  clearError(): void;

  openFile(path: string): Promise<void>;
  setDirty(path: string, dirty: boolean): void;
  setActive(path: string): void;
  save(path: string, options?: { overwrite?: boolean }): Promise<void>;
  reload(path: string): Promise<void>;
  closeTab(path: string): void;
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

  loadRecent: async () => {
    const res = await commands.recentFolders();
    if (res.status === "ok") {
      set({ recent: res.data });
    }
  },

  openFolder: async () => {
    const res = await commands.openFolder();
    if (res.status === "ok") {
      if (res.data === null) {
        return;
      }
      set({ info: res.data, children: {}, expanded: {}, error: null });
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
    const res = await commands.openRecent(path);
    if (res.status === "ok") {
      set({ info: res.data, children: {}, expanded: {}, error: null });
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
    });
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
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty } : t)),
    }));
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
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path ? { ...t, version: newVersion, dirty: false } : t,
        ),
        conflict: s.conflict?.path === path ? null : s.conflict,
        error: null,
      }));
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

      set((s) => ({
        tabs: s.tabs.map((t) =>
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
        ),
        conflict: s.conflict?.path === path ? null : s.conflict,
        error: null,
      }));
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
  },
}));
