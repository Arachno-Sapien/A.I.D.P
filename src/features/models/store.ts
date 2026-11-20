import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type ChatModel,
  type ConnectionView,
  type Effort,
  type LocalModelView,
  type OllamaStatus,
  type PullEvent,
} from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

export interface SelectedModel {
  connectionId: number;
  modelId: string;
}

export function parseModelKey(value: string): SelectedModel | null {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return null;
  const connStr = value.slice(0, colonIndex);
  const modelId = value.slice(colonIndex + 1);
  const connectionId = Number(connStr);
  if (!Number.isInteger(connectionId) || !modelId) return null;
  return { connectionId, modelId };
}

export interface PullProgress {
  name: string;
  status: string;
  completedMb: number;
  totalMb: number;
  /** Cancel was pressed; the pull hasn't returned yet. */
  cancelling?: boolean;
}

// Which pull is current, so a late result from a cancelled one can't clear a newer one.
let pullSeq = 0;

export interface ModelsStore {
  connections: ConnectionView[];
  chatModels: ChatModel[];
  selected: SelectedModel | null;
  loaded: boolean;
  loadError: string | null;

  ollama: OllamaStatus | null;
  localModels: LocalModelView[];
  pull: PullProgress | null;
  pullError: string | null;
  /** Why the last Start, Get Ollama, Delete, Free memory or context change failed. */
  ollamaError: string | null;
  ollamaLoading: boolean;

  refresh(): Promise<void>;
  /** Saves the default; on failure puts the old one back and returns why. */
  select(m: SelectedModel): Promise<string | null>;
  /** Saves a model's effort level, then reloads the list; returns why it failed. */
  setEffort(model: ChatModel, effort: Effort | null): Promise<string | null>;
  refreshOllama(): Promise<void>;
  startOllama(): Promise<void>;
  openOllamaDownload(): Promise<void>;
  pullModel(name: string): Promise<void>;
  cancelPull(): Promise<void>;
  deleteLocal(name: string): Promise<void>;
  unloadLocal(name: string): Promise<void>;
  setContext(modelId: string, numCtx: number): Promise<void>;
}

export const useModelsStore = create<ModelsStore>((set, get) => ({
  connections: [],
  chatModels: [],
  selected: null,
  loaded: false,
  loadError: null,

  ollama: null,
  localModels: [],
  pull: null,
  pullError: null,
  ollamaError: null,
  ollamaLoading: false,

  refresh: async () => {
    const [connRes, modelsRes] = await Promise.all([
      commands.listConnections(),
      commands.chatModels(),
    ]);

    const loadError =
      connRes.status === "error"
        ? appErrorText(connRes.error)
        : modelsRes.status === "error"
        ? appErrorText(modelsRes.error)
        : null;

    const connections = connRes.status === "ok" ? connRes.data : [];
    const chatModels = modelsRes.status === "ok" ? modelsRes.data : [];

    let selected: SelectedModel | null = null;
    const defaultModel = chatModels.find((m) => m.isDefault);
    if (defaultModel) {
      selected = {
        connectionId: defaultModel.connectionId,
        modelId: defaultModel.modelId,
      };
    } else if (chatModels.length > 0) {
      selected = {
        connectionId: chatModels[0].connectionId,
        modelId: chatModels[0].modelId,
      };
    }

    set({
      connections,
      chatModels,
      selected,
      loaded: true,
      loadError,
    });
  },

  select: async (m: SelectedModel) => {
    const prev = get().selected;
    set({ selected: m });
    const res = await commands.setDefaultModel(m.connectionId, m.modelId);
    if (res.status === "ok") return null;
    // Only undo our own pick, not one made while this save was running.
    if (get().selected === m) set({ selected: prev });
    return appErrorText(res.error);
  },

  setEffort: async (model, effort) => {
    const res = await commands.setModelEffort(model.connectionId, model.modelId, effort);
    await get().refresh();
    return res.status === "error" ? appErrorText(res.error) : null;
  },

  refreshOllama: async () => {
    // Cloud models must not wait on the Ollama probe (it can take up to 15 s).
    const early = get().refresh();
    const statusRes = await commands.ollamaStatus();
    if (statusRes.status === "ok") {
      const ollama = statusRes.data;
      set({ ollama });
      if (ollama.state === "running") {
        const modelsRes = await commands.ollamaModels();
        if (modelsRes.status === "ok") {
          set({ localModels: modelsRes.data });
        }
      } else {
        set({ localModels: [] });
      }
    }
    // The early refresh must land first, so the synced local models win.
    await early;
    await get().refresh();
  },

  startOllama: async () => {
    set({ ollamaLoading: true, ollamaError: null });
    const res = await commands.ollamaStart();
    if (res.status === "error") {
      set({ ollamaError: appErrorText(res.error) });
    }
    await get().refreshOllama();
    set({ ollamaLoading: false });
  },

  openOllamaDownload: async () => {
    const res = await commands.ollamaOpenDownload();
    set({ ollamaError: res.status === "error" ? appErrorText(res.error) : null });
  },

  pullModel: async (name: string) => {
    const seq = ++pullSeq;
    set({
      pull: {
        name,
        status: "Starting download…",
        completedMb: 0,
        totalMb: 0,
      },
      pullError: null,
    });
    const channel = new Channel<PullEvent>();
    channel.onmessage = (ev: PullEvent) => {
      if (ev.event === "progress" && seq === pullSeq) {
        set({
          pull: {
            name,
            status: ev.data.status,
            completedMb: ev.data.completedMb,
            totalMb: ev.data.totalMb,
            cancelling: get().pull?.cancelling,
          },
        });
      }
    };
    const res = await commands.ollamaPull(name, channel);
    if (seq !== pullSeq) return;
    if (res.status === "ok") {
      set({ pull: null });
      await get().refreshOllama();
    } else {
      // Cancel is the user's own choice, not a failed download.
      const cancelled =
        res.error.kind === "provider" && res.error.error.kind === "cancelled";
      set({ pull: null, pullError: cancelled ? null : appErrorText(res.error) });
    }
  },

  cancelPull: async () => {
    // pull stays set (Download stays off) until pullModel's own result clears it.
    const pull = get().pull;
    if (pull) set({ pull: { ...pull, cancelling: true } });
    await commands.ollamaCancelPull();
  },

  deleteLocal: async (name: string) => {
    const res = await commands.ollamaDelete(name);
    set({ ollamaError: res.status === "error" ? appErrorText(res.error) : null });
    await get().refreshOllama();
  },

  unloadLocal: async (name: string) => {
    const res = await commands.ollamaUnload(name);
    set({ ollamaError: res.status === "error" ? appErrorText(res.error) : null });
    await get().refreshOllama();
  },

  setContext: async (modelId: string, numCtx: number) => {
    const res = await commands.setModelContext(modelId, numCtx);
    set({ ollamaError: res.status === "error" ? appErrorText(res.error) : null });
    await get().refreshOllama();
  },
}));
