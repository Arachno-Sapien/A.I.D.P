import { create } from "zustand";
import {
  commands,
  type ChatModel,
  type ConnectionView,
} from "../../lib/bindings";
import { appErrorText } from "../chat/appErrorText";

export interface SelectedModel {
  connectionId: number;
  modelId: string;
}

export interface ModelsStore {
  connections: ConnectionView[];
  chatModels: ChatModel[];
  selected: SelectedModel | null;
  loaded: boolean;
  loadError: string | null;
  refresh(): Promise<void>;
  select(m: SelectedModel): Promise<void>;
}

export const useModelsStore = create<ModelsStore>((set) => ({
  connections: [],
  chatModels: [],
  selected: null,
  loaded: false,
  loadError: null,

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
}));
