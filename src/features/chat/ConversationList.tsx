import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Pin,
  PinOff,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useChatStore } from "./store";
import type { Conversation } from "../../lib/bindings";

export function ConversationList({ width }: { width?: number } = {}) {
  const {
    conversations,
    conversationId,
    streaming,
    load,
    startNew,
    remove,
    setPinned,
    setArchived,
  } = useChatStore();

  // Switching mid-reply would leave the reply unsaved, so the list waits for it.
  const busyTitle = streaming ? "Wait for the reply to finish" : undefined;
  const [filter, setFilter] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(filter.toLowerCase()),
  );

  const pinned = filtered.filter((c) => c.pinned && !c.archived);
  const recent = filtered.filter((c) => !c.pinned && !c.archived);
  const archived = filtered.filter((c) => c.archived);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const renderItem = (c: Conversation) => {
    const isActive = c.id === conversationId;
    const isConfirming = confirmDeleteId === c.id;

    if (isConfirming) {
      return (
        <div
          key={c.id}
          className="p-2 rounded-lg bg-neutral-900 border border-red-950 text-neutral-200 space-y-2"
        >
          <div className="text-[11px] text-neutral-300 font-medium">
            Delete this chat?
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setConfirmDeleteId(null);
                await remove(c.id);
              }}
              className="px-2 py-0.5 bg-red-900/60 hover:bg-red-800 text-red-100 rounded text-[11px] font-medium transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={c.id}
        onClick={() => {
          if (!streaming && c.id !== conversationId) {
            void load(c.id);
          }
        }}
        className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? "bg-neutral-800/90 text-white font-medium"
            : "text-neutral-400 hover:bg-neutral-900/80 hover:text-neutral-200"
        }`}
      >
        <div className="min-w-0 flex-1 pr-1.5">
          <div className="truncate text-xs">{c.title}</div>
          <div className="text-[10px] text-neutral-500 font-mono">
            {formatDate(c.updatedAt)}
          </div>
        </div>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
          {!c.archived && (
            <button
              type="button"
              aria-label={c.pinned ? `Unpin ${c.title}` : `Pin ${c.title}`}
              title={c.pinned ? "Unpin this chat" : "Pin this chat"}
              onClick={(e) => {
                e.stopPropagation();
                void setPinned(c.id, !c.pinned);
              }}
              className={`p-1 hover:text-neutral-200 transition-opacity cursor-pointer rounded ${
                c.pinned ? "text-amber-400" : "text-neutral-500"
              }`}
            >
              {c.pinned ? (
                <PinOff size={14} aria-hidden="true" />
              ) : (
                <Pin size={14} aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            aria-label={
              c.archived ? `Unarchive ${c.title}` : `Archive ${c.title}`
            }
            disabled={streaming}
            title={
              streaming
                ? busyTitle
                : c.archived
                ? "Unarchive this chat"
                : "Archive this chat"
            }
            onClick={(e) => {
              e.stopPropagation();
              void setArchived(c.id, !c.archived);
            }}
            className="p-1 hover:text-neutral-200 text-neutral-500 transition-opacity cursor-pointer rounded disabled:cursor-not-allowed"
          >
            {c.archived ? (
              <ArchiveRestore size={14} aria-hidden="true" />
            ) : (
              <Archive size={14} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label={`Delete ${c.title}`}
            disabled={streaming}
            title={busyTitle}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(c.id);
            }}
            className="p-1 hover:text-red-400 text-neutral-500 transition-opacity cursor-pointer rounded disabled:cursor-not-allowed"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col h-full select-none text-xs"
      style={{ width }}
    >
      <div className="p-3 border-b border-neutral-800 space-y-2">
        <button
          type="button"
          disabled={streaming}
          title={busyTitle}
          onClick={() => {
            setConfirmDeleteId(null);
            startNew();
          }}
          className="w-full py-1.5 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-200 hover:text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <SquarePen size={14} aria-hidden="true" />
          <span>New chat</span>
        </button>

        <input
          type="text"
          placeholder="Filter chats…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 text-xs focus:outline-none focus:border-neutral-700"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-neutral-600 text-xs">
            {conversations.length === 0 ? "No chats yet" : "No matching chats"}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="space-y-1">
                <h3 className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-neutral-400">
                  Pinned
                </h3>
                {pinned.map(renderItem)}
              </div>
            )}

            {recent.length > 0 && (
              <div className="space-y-1">
                {pinned.length > 0 && (
                  <h3 className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-neutral-400">
                    Recent
                  </h3>
                )}
                {recent.map(renderItem)}
              </div>
            )}

            {archived.length > 0 && (
              <div className="pt-2 border-t border-neutral-800/80 mt-2">
                <button
                  type="button"
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  <span>Archived ({archived.length})</span>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={`transform transition-transform ${
                      archivedOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {archivedOpen && (
                  <div className="mt-1 space-y-1">
                    {archived.map(renderItem)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
