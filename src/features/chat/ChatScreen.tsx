import { useEffect, useRef, useState } from "react";
import { appErrorText } from "./appErrorText";
import { errorText } from "./errorText";
import { Markdown } from "./Markdown";
import { useChatStore } from "./store";
import { useModelsStore } from "../models/store";

export interface ChatScreenProps {
  onStartAdding?: () => void;
  onNavigateToModels?: () => void;
}

export function ChatScreen({
  onStartAdding,
  onNavigateToModels,
}: ChatScreenProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { connections, chatModels, selected, loaded, loadError, select } =
    useModelsStore();
  const { messages, streaming, send, stop } = useChatStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selected || streaming) return;
    const text = input;
    setInput("");
    await send(text, selected);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedValue = selected
    ? `${selected.connectionId}:${selected.modelId}`
    : "";

  const uniqueConnectionIds = Array.from(
    new Set(chatModels.map((m) => m.connectionId)),
  );

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 font-sans">
      {/* Top Model Selector Bar */}
      {loaded && chatModels.length > 0 && (
        <div className="flex items-center justify-between px-6 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Model:</span>
            <select
              aria-label="Model"
              value={selectedValue}
              onChange={(e) => {
                const [connId, modId] = e.target.value.split(":");
                if (connId && modId) {
                  select({ connectionId: Number(connId), modelId: modId });
                }
              }}
              className="bg-neutral-800 border border-neutral-700/80 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-600 cursor-pointer"
            >
              {uniqueConnectionIds.map((connId) => {
                const groupModels = chatModels.filter(
                  (m) => m.connectionId === connId,
                );
                const label = groupModels[0]?.connectionLabel ?? "";
                return (
                  <optgroup key={connId} label={label}>
                    {groupModels.map((m) => (
                      <option
                        key={`${m.connectionId}:${m.modelId}`}
                        value={`${m.connectionId}:${m.modelId}`}
                      >
                        {m.displayName}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loaded && loadError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-neutral-900 border border-red-900/60 rounded-xl p-8 shadow-xl">
            <h2 className="text-base font-semibold text-red-200 mb-2">
              Unable to load models
            </h2>
            <p className="text-xs text-red-400">
              {loadError}
            </p>
          </div>
        </div>
      ) : loaded && connections.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl">
            <h2 className="text-base font-semibold text-white mb-2">
              Add a model to start chatting
            </h2>
            <p className="text-xs text-neutral-400 mb-6">
              Connect to OpenAI, Anthropic, OpenRouter, or other providers using your own API key.
            </p>
            <button
              type="button"
              onClick={onStartAdding}
              className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white rounded-lg transition-colors cursor-pointer"
            >
              Add a model
            </button>
          </div>
        </div>
      ) : loaded && connections.length > 0 && chatModels.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl">
            <h2 className="text-base font-semibold text-white mb-2">
              Choose which models to use
            </h2>
            <p className="text-xs text-neutral-400 mb-6">
              You have active connections, but haven't selected any models for chat.
            </p>
            <button
              type="button"
              onClick={onNavigateToModels}
              className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white rounded-lg transition-colors cursor-pointer"
            >
              Go to Models
            </button>
          </div>
        </div>
      ) : (
        /* Messages Area */
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500 text-sm select-none">
              Start a conversation
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-neutral-800 text-neutral-100 whitespace-pre-wrap"
                      : "bg-neutral-900 border border-neutral-800 text-neutral-100"
                  }`}
                >
                  {msg.role === "user" ? (
                    msg.text
                  ) : (
                    <>
                      <Markdown text={msg.text} />
                      {msg.status === "streaming" && (
                        <span className="inline-block w-2 h-4 bg-neutral-400 animate-pulse ml-1 align-middle" />
                      )}
                      {msg.status === "stopped" && (
                        <div className="text-xs text-neutral-400 mt-2">
                          Stopped
                        </div>
                      )}
                      {msg.status === "error" && msg.commandError && (
                        <div className="text-xs text-red-400 mt-2">
                          {appErrorText(msg.commandError)}
                        </div>
                      )}
                      {msg.status === "error" &&
                        !msg.commandError &&
                        msg.error && (
                          <div className="text-xs text-red-400 mt-2">
                            {errorText(msg.error)}
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Composer Area */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900/40">
        <div className="max-w-4xl mx-auto flex items-end gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-2 focus-within:border-neutral-700 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!selected}
            placeholder="Type a message... (Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent resize-none px-2 py-1 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none max-h-32 min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !selected}
              className="bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-900 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
