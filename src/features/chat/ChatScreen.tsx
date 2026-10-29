import { useEffect, useRef, useState } from "react";
import {
  commands,
  type ChatConfigView,
  type ConfigError,
} from "../../lib/bindings";
import { errorText } from "./errorText";
import { Markdown } from "./Markdown";
import { useChatStore } from "./store";

export function ChatScreen() {
  const [config, setConfig] = useState<ChatConfigView | null>(null);
  const [initialError, setInitialError] = useState<ConfigError | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    streaming,
    configError: storeConfigError,
    send,
    stop,
  } = useChatStore();

  const activeConfigError = storeConfigError ?? initialError;

  useEffect(() => {
    async function loadConfig() {
      const res = await commands.chatConfig();
      if (res.status === "ok") {
        setConfig(res.data);
      } else {
        setInitialError(res.error);
      }
    }
    loadConfig();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const text = input;
    setInput("");
    await send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm tracking-wide text-white">
            A.I.D.P
          </span>
          {config && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200">
                {config.model}
              </span>
              <span>via {config.host}</span>
            </div>
          )}
        </div>
      </header>

      {/* Insecure Connection Banner */}
      {config?.insecure && (
        <div className="bg-amber-950/70 border-b border-amber-800/80 px-4 py-2 text-xs text-amber-200 text-center">
          Unencrypted connection to {config.host}. Use this only on your own
          network.
        </div>
      )}

      {/* Configuration Error View */}
      {activeConfigError ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl text-sm">
            {activeConfigError.kind === "missing" && (
              <>
                <h2 className="text-base font-semibold text-white mb-2">
                  Configuration Required
                </h2>
                <p className="text-neutral-400 mb-3">
                  Create{" "}
                  <code className="text-amber-400 bg-neutral-950 px-1 py-0.5 rounded break-all">
                    {activeConfigError.path}
                  </code>{" "}
                  with:
                </p>
                <pre className="bg-neutral-950 p-3 rounded text-xs text-neutral-300 overflow-x-auto border border-neutral-800 mb-3">
                  {`{
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini",
  "api_key": "sk-...XXXX"
}`}
                </pre>
                <p className="text-xs text-neutral-500">
                  Restart the app after creating the file.
                </p>
              </>
            )}

            {activeConfigError.kind === "invalid" && (
              <>
                <h2 className="text-base font-semibold text-red-400 mb-2">
                  Configuration Error
                </h2>
                <p className="text-neutral-300">
                  config.local.json could not be read:{" "}
                  {activeConfigError.message}
                </p>
              </>
            )}

            {activeConfigError.kind === "insecureUrl" && (
              <>
                <h2 className="text-base font-semibold text-red-400 mb-2">
                  Insecure URL
                </h2>
                <p className="text-neutral-300">
                  base_url must use https. Plain http is allowed only for
                  localhost or your own network.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Messages Area */
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500 text-sm select-none">
              Start a conversation with {config?.model || "the model"}
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
                      {msg.status === "error" && msg.error && (
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
      {!activeConfigError && (
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/40">
          <div className="max-w-4xl mx-auto flex items-end gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-2 focus-within:border-neutral-700 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Shift+Enter for newline)"
              rows={1}
              className="flex-1 bg-transparent resize-none px-2 py-1 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none max-h-32 min-h-[38px]"
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
                disabled={!input.trim()}
                className="bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-900 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

