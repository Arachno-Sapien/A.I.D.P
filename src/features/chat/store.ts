import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type AppError,
  type Attachment_Deserialize,
  type ChatEvent,
  type ChatEvent_Deserialize,
  type ChatInput_Deserialize,
  type ChatSurface,
  type Conversation,
  type ProviderError,
  type ToolAction,
  type ToolOutcome,
} from "../../lib/bindings";
import { useModelsStore } from "../models/store";
import { fromStored, toStored } from "./persist";

export type MessageStatus = "streaming" | "complete" | "stopped" | "error";

/** A file attached to a message; Rust holds the bytes (decision 0019). */
export type MessageAttachment = Attachment_Deserialize;

export const MAX_ATTACHMENTS = 5;
export const NO_VISION = "This model can't read images";

/** A file's bytes as base64, for `attach_bytes`. */
async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** What the model gets of a message's attachments: their IDs and names. */
function attachmentRefs(list?: MessageAttachment[]) {
  return list && list.length > 0
    ? { attachments: list.map(({ id, name }) => ({ id, name })) }
    : {};
}

/** A streamed chunk joins the last text part, or starts one after a tool step. */
function withText(parts: MessagePart[] | undefined, text: string) {
  if (!parts) return parts;
  const last = parts[parts.length - 1];
  return last?.kind === "text"
    ? [...parts.slice(0, -1), { kind: "text" as const, text: last.text + text }]
    : [...parts, { kind: "text" as const, text }];
}

/** Steps still running when the reply ends are shown as stopped. */
function withStepsStopped(parts: MessagePart[] | undefined) {
  return parts?.map((p) =>
    p.kind === "step" && !p.step.outcome
      ? { kind: "step" as const, step: { ...p.step, outcome: { status: "stopped" as const } } }
      : p,
  );
}

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
  /** Agent edits are written without asking and reviewed at the end (decision 0028). */
  reviewAtEnd?: boolean;
  /** Commands run without asking for this task (decision 0030). */
  runCommands?: boolean;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  content?: string;
  chips?: string[];
  target?: ApplyTarget;
  parts?: MessagePart[];
  attachments?: MessageAttachment[];
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
  /** Set by the first openPlace, so coming back to Chat doesn't reload it mid-reply. */
  opened: boolean;
  place: string | null;
  conversations: Conversation[];
  saveError: string | null;
  /** Files attached to the message being written. */
  pending: MessageAttachment[];
  /** Why a file wasn't attached, or why the message can't be sent. */
  attachNotice: string | null;

  addAttachments(list: MessageAttachment[], refused?: string[]): void;
  removeAttachment(id: string): void;
  pickAttachments(): Promise<void>;
  pasteFiles(files: File[]): Promise<void>;
  openPlace(place: string | null): Promise<void>;
  load(id: number): Promise<void>;
  startNew(): void;
  remove(id: number): Promise<void>;
  setPinned(id: number, pinned: boolean): Promise<void>;
  setArchived(id: number, archived: boolean): Promise<void>;

  send(
    text: string,
    model: { connectionId: number; modelId: string },
    extra?: SendExtra,
  ): Promise<void>;
  stop(): Promise<void>;
  applyEvent(id: string, ev: ChatEvent, convId?: number | null): void;
  answer(id: number, approve: boolean): Promise<boolean>;
  clear(): void;
}

export const createChatStore = (surface: ChatSurface, hooks?: ChatHooks) => {
  const inFlightReplies = new Map<
    string,
    { message: UiMessage; convId: number | null }
  >();
  // True from Send until the reply starts streaming: a second Send in between
  // (Enter twice, with only attachments to send) would post the message twice.
  let sending = false;

  return create<ChatStore>((set, get) => ({
    messages: [],
    streaming: false,
    conversationId: null,
    opened: false,
    place: null,
    conversations: [],
    saveError: null,
    pending: [],
    attachNotice: null,

    addAttachments: (list: MessageAttachment[], refused: string[] = []) => {
      const pending = [...get().pending];
      const notes = [...refused];
      for (const attachment of list) {
        if (pending.some((p) => p.id === attachment.id)) continue;
        if (pending.length >= MAX_ATTACHMENTS) {
          notes.push(`A message takes at most ${MAX_ATTACHMENTS} attachments.`);
          break;
        }
        pending.push(attachment);
      }
      set({ pending, attachNotice: notes.length > 0 ? notes.join("\n") : null });
    },

    removeAttachment: (id: string) => {
      set({ pending: get().pending.filter((a) => a.id !== id), attachNotice: null });
    },

    // Rust opens the dialog and reads the files; the UI never sees a path.
    pickAttachments: async () => {
      const res = await commands.pickAttachments();
      if (res.status === "ok") {
        get().addAttachments(res.data.added, res.data.refused);
      } else {
        set({ attachNotice: "Couldn't open those files." });
      }
    },

    pasteFiles: async (files: File[]) => {
      const added: MessageAttachment[] = [];
      const refused: string[] = [];
      for (const file of files) {
        const name = file.name || "pasted-image.png";
        const res = await commands.attachBytes(name, await toBase64(file));
        if (res.status === "ok") {
          added.push(res.data);
        } else {
          refused.push(
            res.error.kind === "invalidInput"
              ? res.error.message
              : `${name} couldn't be attached.`,
          );
        }
      }
      get().addAttachments(added, refused);
    },

    openPlace: async (place: string | null) => {
      set({ place, opened: true });
      const res = await commands.listConversations(place);
      if (res.status === "ok") {
        const conversations = res.data;
        set({ conversations });
        const unarchived = conversations.filter((c) => !c.archived);
        if (unarchived.length > 0) {
          await get().load(unarchived[0].id);
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

    setPinned: async (id: number, pinned: boolean) => {
      // The list changes only once the database has.
      const res = await commands.setConversationPinned(id, pinned);
      if (res.status !== "ok") return;
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, pinned } : c,
        ),
      }));
    },

    setArchived: async (id: number, archived: boolean) => {
      const res = await commands.setConversationArchived(id, archived);
      if (res.status !== "ok") return;
      const updated = get().conversations.map((c) =>
        c.id === id ? { ...c, archived, pinned: archived ? false : c.pinned } : c,
      );
      set({ conversations: updated });
      if (archived && get().conversationId === id) {
        const nextUnarchived = updated.filter((c) => !c.archived);
        if (nextUnarchived.length > 0) {
          await get().load(nextUnarchived[0].id);
        } else {
          get().startNew();
        }
      }
    },

    remove: async (id: number) => {
      // The list changes only once the database has.
      const res = await commands.deleteConversation(id);
      if (res.status !== "ok") return;
      const remaining = get().conversations.filter((c) => c.id !== id);
      set({ conversations: remaining });
      if (get().conversationId === id) {
        const nextUnarchived = remaining.filter((c) => !c.archived);
        if (nextUnarchived.length > 0 && get().place === null) {
          await get().load(nextUnarchived[0].id);
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
      const pending = get().pending;
      if ((!trimmed && pending.length === 0) || get().streaming || sending) {
        return;
      }

      const knownModel = useModelsStore
        .getState()
        .chatModels.find(
          (m) =>
            m.connectionId === model.connectionId &&
            m.modelId === model.modelId,
        );
      // Rust refuses this too; stopping here keeps the message and its files.
      if (knownModel?.supportsVision === false && pending.some((a) => a.kind === "image")) {
        set({ attachNotice: NO_VISION });
        return;
      }

      const isAgent = Boolean(extra?.agent);
      const modelRef = `${model.connectionId}:${model.modelId}`;
      const modelName =
        knownModel?.displayName || knownModel?.modelId || model.modelId;
      const assistantId = crypto.randomUUID();
      const history: ChatInput_Deserialize[] = [];
      let activeConvId = get().conversationId;

      sending = true;
      try {
        if (activeConvId === null) {
          const createRes = await commands.createConversation(
            trimmed || pending[0].name,
            get().place,
          );
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

        const userMessage: UiMessage = {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
          content: extra?.content,
          chips: extra?.chips,
          attachments: pending.length > 0 ? pending : undefined,
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

        if (extra?.system && !isAgent) {
          history.push({ role: "system", content: extra.system });
        }
        for (const m of get().messages) {
          if (
            (m.status === "complete" || m.status === "stopped") &&
            (m.text.trim() !== "" || (m.attachments?.length ?? 0) > 0)
          ) {
            history.push({
              role: m.role,
              content: m.content ?? m.text,
              ...attachmentRefs(m.attachments),
            });
          }
        }
        history.push({
          role: "user",
          content: extra?.content ?? trimmed,
          ...attachmentRefs(pending),
        });

        inFlightReplies.set(assistantId, {
          message: assistantPlaceholder,
          convId: activeConvId,
        });

        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === activeConvId ? { ...c, archived: false } : c,
          ),
          messages: [...state.messages, userMessage, assistantPlaceholder],
          streaming: true,
          pending: [],
          attachNotice: null,
        }));
      } finally {
        sending = false;
      }

      const channel = new Channel<ChatEvent_Deserialize>();
      channel.onmessage = (ev: ChatEvent_Deserialize) => {
        get().applyEvent(assistantId, ev, activeConvId);
      };

      const res = isAgent
        ? await commands.runAgent(
            model.connectionId,
            model.modelId,
            history,
            {
              reviewAtEnd: extra?.reviewAtEnd ?? false,
              runCommands: extra?.runCommands ?? false,
            },
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
        inFlightReplies.delete(assistantId);
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

    applyEvent: (id: string, ev: ChatEvent, convId?: number | null) => {
      const inFlight = inFlightReplies.get(id);
      // The same change goes to the message on screen and to the copy kept
      // for saving a reply whose chat is no longer the one open.
      const change = (fn: (m: UiMessage) => UiMessage) => {
        if (inFlight) inFlight.message = fn(inFlight.message);
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? fn(m) : m)),
        }));
      };

      if (ev.event === "delta") {
        change((m) => ({
          ...m,
          text: m.text + ev.data,
          parts: withText(m.parts, ev.data),
        }));
      } else if (ev.event === "toolCall") {
        const step: ToolStep = {
          id: ev.data.id,
          action: ev.data.action,
          needsAnswer: ev.data.needsAnswer,
        };
        change((m) =>
          m.parts ? { ...m, parts: [...m.parts, { kind: "step", step }] } : m,
        );
        hooks?.onToolCall?.(step);
      } else if (ev.event === "toolResult") {
        let updatedStep: ToolStep | undefined;
        change((m) =>
          m.parts
            ? {
                ...m,
                parts: m.parts.map((p) => {
                  if (p.kind !== "step" || p.step.id !== ev.data.id) return p;
                  updatedStep = { ...p.step, outcome: ev.data.outcome };
                  return { kind: "step" as const, step: updatedStep };
                }),
              }
            : m,
        );
        if (updatedStep) {
          hooks?.onToolResult?.(updatedStep);
        }
      } else {
        // The reply is over: finished, stopped by the user, or failed.
        inFlightReplies.delete(id);
        const targetConvId =
          inFlight?.convId ??
          (convId !== undefined ? convId : get().conversationId);

        const failed = ev.event === "error" ? ev.data : undefined;
        const isCancelled = failed?.kind === "cancelled";
        const status: MessageStatus = !failed
          ? "complete"
          : isCancelled
            ? "stopped"
            : "error";
        const end = (m: UiMessage): UiMessage => ({
          ...m,
          status,
          ...(failed ? { error: isCancelled ? undefined : failed } : {}),
          parts: withStepsStopped(m.parts),
        });

        let endedMsg: UiMessage | undefined;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            endedMsg = end(m);
            return endedMsg;
          }),
          streaming: false,
        }));
        if (!endedMsg && inFlight) {
          endedMsg = end(inFlight.message);
        }

        if (targetConvId !== null && endedMsg) {
          const usage =
            ev.event === "done" ? ((ev.data as any)?.usage ?? ev.data) : null;
          const msgToSave: UiMessage = endedMsg;
          void commands
            .appendMessage(targetConvId, {
              role: "assistant",
              contentParts: toStored(msgToSave),
              modelRef: msgToSave.modelRef ?? null,
              modelName: msgToSave.modelName ?? null,
              status,
              errorKind: failed && !isCancelled ? failed.kind : null,
              tokensIn: usage?.tokensIn ?? null,
              tokensOut: usage?.tokensOut ?? null,
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
};

export const useChatStore = createChatStore("chat");
