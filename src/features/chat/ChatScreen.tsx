import { useEffect } from "react";
import { Composer } from "./Composer";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
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
  const {
    connections,
    chatModels,
    selected,
    loaded,
    loadError,
    ollama,
  } = useModelsStore();
  const { messages, streaming, send, stop, openPlace } = useChatStore();

  const cloudConnections = connections.filter((c) => c.kind !== "ollama");
  const isOllamaRunning = ollama?.state === "running";

  // Only the first visit opens the newest chat: Chat unmounts when another
  // screen is shown, and reloading on return would drop a streaming reply.
  useEffect(() => {
    if (!useChatStore.getState().opened) {
      void openPlace(null);
    }
  }, [openPlace]);

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 font-sans">
      <ModelPicker />

      <div className="flex-1 flex flex-row min-h-0">
        <ConversationList />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Main Content Area */}
          {loaded && loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md w-full bg-neutral-900 border border-red-900/60 rounded-xl p-8 shadow-xl">
                <h2 className="text-base font-semibold text-red-200 mb-2">
                  Unable to load models
                </h2>
                <p className="text-xs text-red-400">{loadError}</p>
              </div>
            </div>
          ) : loaded && chatModels.length === 0 ? (
            cloudConnections.length === 0 && isOllamaRunning ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl">
                  <h2 className="text-base font-semibold text-white mb-2">
                    Download a local model
                  </h2>
                  <p className="text-xs text-neutral-400 mb-6">
                    Ollama is running. Download a model to start chatting locally.
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
            ) : cloudConnections.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl">
                  <h2 className="text-base font-semibold text-white mb-2">
                    Add a model to start chatting
                  </h2>
                  <p className="text-xs text-neutral-400 mb-6">
                    Connect to OpenAI, Anthropic, OpenRouter, or other providers using
                    your own API key.
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
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl">
                  <h2 className="text-base font-semibold text-white mb-2">
                    Choose which models to use
                  </h2>
                  <p className="text-xs text-neutral-400 mb-6">
                    You have active connections, but haven't selected any models for
                    chat.
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
            )
          ) : (
            <MessageList messages={messages} />
          )}

          <Composer
            onSend={(text) => {
              if (selected) {
                void send(text, selected);
              }
            }}
            onStop={() => void stop()}
            streaming={streaming}
            disabled={!selected}
          />
        </div>
      </div>
    </div>
  );
}
