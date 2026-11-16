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

export const useSettingsStore = create<SettingsStore>((set, get) => {
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

    // Each setter shows the new value at once; a failed save puts the old one back and says why.
    setTheme: async (theme: Theme) => {
      const prev = get().theme;
      set({ theme, resolved: applyTheme(theme) });
      const res = await commands.setTheme(theme);
      if (res.status === "error") {
        set({ theme: prev, resolved: applyTheme(prev), loadError: appErrorText(res.error) });
      } else {
        set({ loadError: null });
      }
    },

    setKeepAlive: async (keepAlive: KeepAlive) => {
      const prev = get().keepAlive;
      set({ keepAlive });
      const res = await commands.setKeepAlive(keepAlive);
      set(
        res.status === "error"
          ? { keepAlive: prev, loadError: appErrorText(res.error) }
          : { loadError: null },
      );
    },

    setCheckUpdates: async (enabled: boolean) => {
      const prev = get().checkUpdatesAtStart;
      set({ checkUpdatesAtStart: enabled });
      const res = await commands.setCheckUpdates(enabled);
      set(
        res.status === "error"
          ? { checkUpdatesAtStart: prev, loadError: appErrorText(res.error) }
          : { loadError: null },
      );
    },
  };
});
