import { create } from "zustand";
import { commands, type KeepAlive, type Theme } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";
import { applyTheme, setSystemChangeCallback } from "./theme";

export interface SettingsStore {
  theme: Theme;
  resolved: "dark" | "light";
  keepAlive: KeepAlive;
  checkUpdatesAtStart: boolean;
  loaded: boolean;
  loadError: string | null;

  load(): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  setKeepAlive(keepAlive: KeepAlive): Promise<void>;
  setCheckUpdates(enabled: boolean): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => {
  setSystemChangeCallback((resolved) => {
    set({ resolved });
  });

  return {
    theme: "dark",
    resolved: "dark",
    keepAlive: "ollamaDefault",
    checkUpdatesAtStart: true,
    loaded: false,
    loadError: null,

    load: async () => {
      const res = await commands.getSettings();
      if (res.status === "ok") {
        const resolved = applyTheme(res.data.theme);
        set({
          theme: res.data.theme,
          resolved,
          keepAlive: res.data.keepAlive,
          checkUpdatesAtStart: res.data.checkUpdatesAtStart,
          loaded: true,
          loadError: null,
        });
      } else {
        const resolved = applyTheme("dark");
        set({
          resolved,
          loaded: true,
          loadError: appErrorText(res.error),
        });
      }
    },

    setTheme: async (theme: Theme) => {
      const resolved = applyTheme(theme);
      set({ theme, resolved });
      await commands.setTheme(theme);
    },

    setKeepAlive: async (keepAlive: KeepAlive) => {
      set({ keepAlive });
      await commands.setKeepAlive(keepAlive);
    },

    setCheckUpdates: async (enabled: boolean) => {
      set({ checkUpdatesAtStart: enabled });
      await commands.setCheckUpdates(enabled);
    },
  };
});
