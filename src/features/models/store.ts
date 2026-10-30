import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type ChatModel,
  type ConnectionView,
  type LocalModelView,
  type OllamaStatus,
  type PullEvent,
} from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

export interface SelectedModel {
  connectionId: number;
  modelId: string;
}

export interface PullProgress {
  name: string;
  status: string;
  completedMb: number;
  totalMb: number;
}

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
  ollamaLoading: boolean;

  refresh(): Promise<void>;
  select(m: SelectedModel): Promise<void>;
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
    set({ selected: m });
    await commands.setDefaultModel(m.connectionId, m.modelId);
  },

  refreshOllama: async () => {
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
    await get().refresh();
  },

  startOllama: async () => {
    set({ ollamaLoading: true });
    await commands.ollamaStart();
    await get().refreshOllama();
    set({ ollamaLoading: false });
  },

  openOllamaDownload: async () => {
    await commands.ollamaOpenDownload();
  },

  pullModel: async (name: string) => {
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
      if (ev.event === "progress") {
        set({
          pull: {
            name,
            status: ev.data.status,
            completedMb: ev.data.completedMb,
            totalMb: ev.data.totalMb,
          },
        });
      }
    };
    const res = await commands.ollamaPull(name, channel);
    if (res.status === "ok") {
      set({ pull: null });
      await get().refreshOllama();
    } else {
      set({ pull: null, pullError: appErrorText(res.error) });
    }
  },

  cancelPull: async () => {
    await commands.ollamaCancelPull();
    set({ pull: null });
  },

  deleteLocal: async (name: string) => {
    await commands.ollamaDelete(name);
    await get().refreshOllama();
  },

  unloadLocal: async (name: string) => {
    await commands.ollamaUnload(name);
    await get().refreshOllama();
  },

  setContext: async (modelId: string, numCtx: number) => {
    await commands.setModelContext(modelId, numCtx);
    await get().refreshOllama();
  },
}));
