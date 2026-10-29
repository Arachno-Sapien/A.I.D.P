import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type AppError,
  type ChatEvent,
  type ChatEvent_Deserialize,
  type ChatMessage,
  type ChatSurface,
  type ProviderError,
} from "../../lib/bindings";

export type MessageStatus = "streaming" | "complete" | "stopped" | "error";

export interface ApplyTarget {
  path: string;
  selection: string | null;
}

export interface SendExtra {
  content?: string;
  system?: string;
  chips?: string[];
  target?: ApplyTarget;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  content?: string;
  chips?: string[];
  target?: ApplyTarget;
  status: MessageStatus;
  error?: ProviderError;
  commandError?: AppError;
}

export interface ChatStore {
  messages: UiMessage[];
  streaming: boolean;
  send(
    text: string,
    model: { connectionId: number; modelId: string },
    extra?: SendExtra,
  ): Promise<void>;
  stop(): Promise<void>;
  applyEvent(id: string, ev: ChatEvent): void;
  clear(): void;
}

export const createChatStore = (surface: ChatSurface) =>
  create<ChatStore>((set, get) => ({
    messages: [],
    streaming: false,

    send: async (
      text: string,
      model: { connectionId: number; modelId: string },
      extra?: SendExtra,
    ) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming) {
        return;
      }

      const userMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        content: extra?.content,
        chips: extra?.chips,
        status: "complete",
      };

      const assistantId = crypto.randomUUID();
      const assistantPlaceholder: UiMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        target: extra?.target,
        status: "streaming",
      };

      const history: ChatMessage[] = [];
      if (extra?.system) {
        history.push({ role: "system", content: extra.system });
      }
      for (const m of get().messages) {
        if (
          (m.status === "complete" || m.status === "stopped") &&
          m.text.trim() !== ""
        ) {
          history.push({ role: m.role, content: m.content ?? m.text });
        }
      }
      history.push({
        role: "user",
        content: extra?.content ?? trimmed,
      });

      set((state) => ({
        messages: [...state.messages, userMessage, assistantPlaceholder],
        streaming: true,
      }));

      const channel = new Channel<ChatEvent_Deserialize>();
      channel.onmessage = (ev: ChatEvent_Deserialize) => {
        get().applyEvent(assistantId, ev);
      };

      const res = await commands.sendMessage(
        surface,
        model.connectionId,
        model.modelId,
        history,
        channel,
      );
      if (res.status === "error") {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantId
              ? { ...m, status: "error", commandError: res.error }
              : m,
          ),
          streaming: false,
        }));
      }
    },

    applyEvent: (id: string, ev: ChatEvent) => {
      if (ev.event === "delta") {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, text: m.text + ev.data } : m,
          ),
        }));
      } else if (ev.event === "done") {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, status: "complete" } : m,
          ),
          streaming: false,
        }));
      } else if (ev.event === "error") {
        const isCancelled = ev.data.kind === "cancelled";
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status: isCancelled ? "stopped" : "error",
                  error: isCancelled ? undefined : ev.data,
                }
              : m,
          ),
          streaming: false,
        }));
      }
    },

    stop: async () => {
      await commands.stopReply(surface);
    },

    clear: () => {
      set({ messages: [], streaming: false });
    },
  }));

export const useChatStore = createChatStore("chat");
