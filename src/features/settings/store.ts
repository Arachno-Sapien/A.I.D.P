import { create } from "zustand";
import { commands, type KeepAlive, type Theme } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

export interface SettingsStore {
  theme: Theme;
  keepAlive: KeepAlive;
  loaded: boolean;
  loadError: string | null;

  load(): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  setKeepAlive(keepAlive: KeepAlive): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  theme: "dark",
  keepAlive: "ollamaDefault",
  loaded: false,
  loadError: null,

  load: async () => {
    const res = await commands.getSettings();
    if (res.status === "ok") {
      set({
        theme: res.data.theme,
        keepAlive: res.data.keepAlive,
        loaded: true,
        loadError: null,
      });
    } else {
      set({
        loaded: true,
        loadError: appErrorText(res.error),
      });
    }
  },

  setTheme: async (theme: Theme) => {
    set({ theme });
    await commands.setTheme(theme);
  },

  setKeepAlive: async (keepAlive: KeepAlive) => {
    set({ keepAlive });
    await commands.setKeepAlive(keepAlive);
  },
}));

