import type { StoredMessage } from "../../lib/bindings";
import type { MessageStatus, UiMessage } from "./store";

export interface StoredEnvelope {
  v: 1;
  text: string;
  content?: string;
  chips?: string[];
  target?: UiMessage["target"];
  parts?: UiMessage["parts"];
  /** The whole error, so a provider error keeps its message after a restart. */
  error?: UiMessage["error"];
}

export function toStored(m: UiMessage): string {
  const envelope: StoredEnvelope = {
    v: 1,
    text: m.text,
    content: m.content,
    chips: m.chips,
    target: m.target,
    parts: m.parts,
    error: m.error,
  };
  return JSON.stringify(envelope);
}

export function fromStored(rowOrJson: StoredMessage | string): UiMessage {
  const isRow =
    typeof rowOrJson === "object" &&
    rowOrJson !== null &&
    "contentParts" in rowOrJson;
  const rawParts = isRow ? rowOrJson.contentParts : rowOrJson;

  let parsed: Partial<StoredEnvelope> | null = null;
  try {
    const val = JSON.parse(rawParts);
    if (typeof val === "object" && val !== null) {
      parsed = val;
    }
  } catch {
    // Unparseable JSON, fall back to raw text
  }

  const role = isRow
    ? rowOrJson.role === "assistant"
      ? "assistant"
      : "user"
    : "user";
  const status: MessageStatus = isRow
    ? (rowOrJson.status as MessageStatus)
    : "complete";
  const modelName = isRow ? (rowOrJson.modelName ?? undefined) : undefined;
  const text =
    parsed && typeof parsed.text === "string" ? parsed.text : rawParts;

  let error: UiMessage["error"];
  if (isRow && rowOrJson.errorKind && parsed?.error) {
    error = parsed.error;
  } else if (isRow && rowOrJson.errorKind) {
    if (rowOrJson.errorKind === "provider") {
      error = { kind: "provider", message: "" };
    } else {
      error = { kind: rowOrJson.errorKind as any };
    }
  }

  return {
    id: isRow ? String(rowOrJson.id) : crypto.randomUUID(),
    role,
    text,
    content: parsed?.content,
    chips: parsed?.chips,
    target: parsed?.target,
    parts: parsed?.parts,
    status,
    modelName,
    error,
  };
}
