import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { commands, type UpdateEvent, type UpdateInfo } from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

/** How long after start the app waits before its quiet update check. */
export const START_CHECK_DELAY_MS = 10_000;

export interface UpdatesStore {
  version: string | null;
  found: UpdateInfo | null;
  /** Later was clicked; the bar stays hidden until the next check. */
  dismissed: boolean;
  checking: boolean;
  upToDate: boolean;
  stage: "downloading" | "installing" | null;
  progress: { downloadedKb: number; totalKb: number } | null;
  error: string | null;

  loadVersion(): Promise<void>;
  /** A quiet check (the one at start) shows nothing when it fails or finds nothing. */
  check(quiet: boolean): Promise<void>;
  install(): Promise<void>;
  later(): void;
}

export const useUpdatesStore = create<UpdatesStore>((set, get) => ({
  version: null,
  found: null,
  dismissed: false,
  checking: false,
  upToDate: false,
  stage: null,
  progress: null,
  error: null,

  loadVersion: async () => {
    set({ version: await commands.appVersion() });
  },

  check: async (quiet) => {
    if (get().checking || get().stage) return;
    set(quiet ? { checking: true } : { checking: true, error: null, upToDate: false });
    const res = await commands.checkUpdate();
    if (res.status === "ok") {
      set({
        checking: false,
        found: res.data,
        dismissed: false,
        upToDate: !quiet && res.data === null,
      });
    } else {
      set(quiet ? { checking: false } : { checking: false, error: appErrorText(res.error) });
    }
  },

  install: async () => {
    if (get().stage) return;
    const channel = new Channel<UpdateEvent>();
    channel.onmessage = (ev) => {
      if (ev.event === "progress") {
        set({ progress: ev.data });
      } else {
        set({ stage: "installing" });
      }
    };
    set({ stage: "downloading", progress: null, error: null });
    const res = await commands.installUpdate(channel);
    // A finished install restarts the app, so only a failure comes back.
    if (res.status === "error") {
      set({ stage: null, progress: null, error: appErrorText(res.error) });
    }
  },

  later: () => {
    set({ dismissed: true });
  },
}));
