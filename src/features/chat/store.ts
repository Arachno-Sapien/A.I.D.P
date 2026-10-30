import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type AppError,
  type ChatEvent,
  type ChatEvent_Deserialize,
  type ChatMessage,
  type ChatSurface,
  type Conversation,
  type ProviderError,
  type ToolAction,
  type ToolOutcome,
} from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { fromStored, toStored } from "./persist";

export type MessageStatus = "streaming" | "complete" | "stopped" | "error";

export interface ApplyTarget {
  path: string;
  selection: string | null;
}

export interface ToolStep {
  id: number;
  action: ToolAction;
  needsAnswer: boolean;
  answered?: boolean;
  outcome?: ToolOutcome;
}

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "step"; step: ToolStep };

export interface SendExtra {
  content?: string;
  system?: string;
  chips?: string[];
  target?: ApplyTarget;
  agent?: boolean;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  content?: string;
  chips?: string[];
  target?: ApplyTarget;
  parts?: MessagePart[];
  status: MessageStatus;
  modelRef?: string;
  modelName?: string;
  error?: ProviderError;
  commandError?: AppError;
}

export interface ChatHooks {
  onToolCall?(step: ToolStep): void;
  onToolResult?(step: ToolStep): void;
}

export interface ChatStore {
  messages: UiMessage[];
  streaming: boolean;
  conversationId: number | null;
  place: string | null;
  conversations: Conversation[];
  saveError: string | null;

  openPlace(place: string | null): Promise<void>;
  load(id: number): Promise<void>;
  startNew(): void;
  remove(id: number): Promise<void>;

  send(
    text: string,
    model: { connectionId: number; modelId: string },
    extra?: SendExtra,
  ): Promise<void>;
  stop(): Promise<void>;
  applyEvent(id: string, ev: ChatEvent): void;
  answer(id: number, approve: boolean): Promise<boolean>;
  clear(): void;
}

export const createChatStore = (surface: ChatSurface, hooks?: ChatHooks) =>
  create<ChatStore>((set, get) => ({
    messages: [],
    streaming: false,
    conversationId: null,
    place: null,
    conversations: [],
    saveError: null,

    openPlace: async (place: string | null) => {
      set({ place });
      const res = await commands.listConversations(place);
      if (res.status === "ok") {
        const conversations = res.data;
        set({ conversations });
        if (conversations.length > 0) {
          await get().load(conversations[0].id);
        } else {
          get().startNew();
        }
      }
    },

    load: async (id: number) => {
      const res = await commands.loadMessages(id);
      if (res.status === "ok") {
        set({
          conversationId: id,
          messages: res.data.map(fromStored),
          streaming: false,
          saveError: null,
        });
      }
    },

    startNew: () => {
      set({
        conversationId: null,
        messages: [],
        streaming: false,
        saveError: null,
      });
    },

    remove: async (id: number) => {
      await commands.deleteConversation(id);
      const remaining = get().conversations.filter((c) => c.id !== id);
      set({ conversations: remaining });
      if (get().conversationId === id) {
        if (remaining.length > 0 && get().place === null) {
          await get().load(remaining[0].id);
        } else {
          get().startNew();
        }
      }
    },

    send: async (
      text: string,
      model: { connectionId: number; modelId: string },
      extra?: SendExtra,
    ) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming) {
        return;
      }

      const isAgent = Boolean(extra?.agent);

      let activeConvId = get().conversationId;
      if (activeConvId === null) {
        const createRes = await commands.createConversation(trimmed, get().place);
        if (createRes.status === "ok") {
          activeConvId = createRes.data.id;
          set((state) => ({
            conversationId: activeConvId,
            conversations: [createRes.data, ...state.conversations],
          }));
        } else {
          set({ saveError: "Couldn't save this message." });
        }
      }

      const modelRef = `${model.connectionId}:${model.modelId}`;
      const knownModel = useModelsStore
        .getState()
        .chatModels.find(
          (m) =>
            m.connectionId === model.connectionId &&
            m.modelId === model.modelId,
        );
      const modelName =
        knownModel?.displayName || knownModel?.modelId || model.modelId;

      const userMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        content: extra?.content,
        chips: extra?.chips,
        status: "complete",
      };

      if (activeConvId !== null) {
        const appendRes = await commands.appendMessage(activeConvId, {
          role: "user",
          contentParts: toStored(userMessage),
          modelRef: null,
          modelName: null,
          status: "complete",
          errorKind: null,
          tokensIn: null,
          tokensOut: null,
        });
        if (appendRes.status === "error") {
          set({ saveError: "Couldn't save this message." });
        }
      }

      const assistantId = crypto.randomUUID();
      const assistantPlaceholder: UiMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        target: extra?.target,
        parts: isAgent ? [] : undefined,
        status: "streaming",
        modelRef,
        modelName,
      };

      const history: ChatMessage[] = [];
      if (extra?.system && !isAgent) {
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

      const res = isAgent
        ? await commands.runAgent(
            model.connectionId,
            model.modelId,
            history,
            channel,
          )
        : await commands.sendMessage(
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
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            let parts = m.parts;
            if (parts) {
              const last = parts[parts.length - 1];
              if (last && last.kind === "text") {
                parts = [
                  ...parts.slice(0, -1),
                  { kind: "text", text: last.text + ev.data },
                ];
              } else {
                parts = [...parts, { kind: "text", text: ev.data }];
              }
            }
            return {
              ...m,
              text: m.text + ev.data,
              parts,
            };
          }),
        }));
      } else if (ev.event === "toolCall") {
        const step: ToolStep = {
          id: ev.data.id,
          action: ev.data.action,
          needsAnswer: ev.data.needsAnswer,
        };
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const parts = m.parts ? [...m.parts, { kind: "step" as const, step }] : m.parts;
            return { ...m, parts };
          }),
        }));
        hooks?.onToolCall?.(step);
      } else if (ev.event === "toolResult") {
        let updatedStep: ToolStep | undefined;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id || !m.parts) return m;
            const parts = m.parts.map((p) => {
              if (p.kind === "step" && p.step.id === ev.data.id) {
                updatedStep = { ...p.step, outcome: ev.data.outcome };
                return { kind: "step" as const, step: updatedStep };
              }
              return p;
            });
            return { ...m, parts };
          }),
        }));
        if (updatedStep) {
          hooks?.onToolResult?.(updatedStep);
        }
      } else if (ev.event === "done") {
        let completedMsg: UiMessage | undefined;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const parts = m.parts?.map((p) => {
              if (p.kind === "step" && !p.step.outcome) {
                return {
                  kind: "step" as const,
                  step: { ...p.step, outcome: { status: "stopped" as const } },
                };
              }
              return p;
            });
            completedMsg = { ...m, status: "complete", parts };
            return completedMsg;
          }),
          streaming: false,
        }));

        const activeConvId = get().conversationId;
        if (activeConvId !== null && completedMsg) {
          const usage = (ev.data as any)?.usage ?? ev.data;
          const msgToSave = completedMsg;
          void commands
            .appendMessage(activeConvId, {
              role: "assistant",
              contentParts: toStored(msgToSave),
              modelRef: msgToSave.modelRef ?? null,
              modelName: msgToSave.modelName ?? null,
              status: "complete",
              errorKind: null,
              tokensIn: usage?.tokensIn ?? null,
              tokensOut: usage?.tokensOut ?? null,
            })
            .then((res) => {
              if (res.status === "error") {
                set({ saveError: "Couldn't save this message." });
              }
            });
        }
      } else if (ev.event === "error") {
        const isCancelled = ev.data.kind === "cancelled";
        const status: MessageStatus = isCancelled ? "stopped" : "error";
        const errorKind = isCancelled ? null : ev.data.kind;

        let endedMsg: UiMessage | undefined;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const parts = m.parts?.map((p) => {
              if (p.kind === "step" && !p.step.outcome) {
                return {
                  kind: "step" as const,
                  step: { ...p.step, outcome: { status: "stopped" as const } },
                };
              }
              return p;
            });
            endedMsg = {
              ...m,
              status,
              error: isCancelled ? undefined : ev.data,
              parts,
            };
            return endedMsg;
          }),
          streaming: false,
        }));

        const activeConvId = get().conversationId;
        if (activeConvId !== null && endedMsg) {
          const msgToSave = endedMsg;
          void commands
            .appendMessage(activeConvId, {
              role: "assistant",
              contentParts: toStored(msgToSave),
              modelRef: msgToSave.modelRef ?? null,
              modelName: msgToSave.modelName ?? null,
              status,
              errorKind,
              tokensIn: null,
              tokensOut: null,
            })
            .then((res) => {
              if (res.status === "error") {
                set({ saveError: "Couldn't save this message." });
              }
            });
        }
      }
    },

    answer: async (id: number, approve: boolean) => {
      set((state) => ({
        messages: state.messages.map((m) => {
          if (!m.parts) return m;
          return {
            ...m,
            parts: m.parts.map((p) =>
              p.kind === "step" && p.step.id === id
                ? { ...p, step: { ...p.step, answered: true } }
                : p,
            ),
          };
        }),
      }));
      return await commands.answerTool(id, approve);
    },

    stop: async () => {
      await commands.stopReply(surface);
    },

    clear: () => {
      set({ messages: [], streaming: false });
    },
  }));

export const useChatStore = createChatStore("chat");
