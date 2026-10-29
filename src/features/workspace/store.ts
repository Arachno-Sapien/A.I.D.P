import { create } from "zustand";
import {
  commands,
  type DirEntry,
  type WorkspaceInfo,
} from "../../lib/bindings";
import { workspaceErrorText } from "./workspaceErrorText";

export interface WorkspaceStore {
  info: WorkspaceInfo | null;
  recent: string[];
  children: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  error: string | null;

  loadRecent(): Promise<void>;
  openFolder(): Promise<void>;
  openRecent(path: string): Promise<void>;
  closeFolder(): Promise<void>;
  toggleDir(path: string): Promise<void>;
  refreshTree(): Promise<void>;
  clearError(): void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  info: null,
  recent: [],
  children: {},
  expanded: {},
  error: null,

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
    set({ info: null, children: {}, expanded: {}, error: null });
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
}));
