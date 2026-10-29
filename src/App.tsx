import { useEffect, useState } from "react";
import { ChatScreen } from "./features/chat/ChatScreen";
import { ModelsScreen } from "./features/models/ModelsScreen";
import { useModelsStore } from "./features/models/store";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<"chat" | "models">("chat");
  const [startAdding, setStartAdding] = useState(false);

  useEffect(() => {
    useModelsStore.getState().refresh();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans">
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
        <span className="font-semibold text-sm tracking-wide text-white">
          A.I.D.P
        </span>
        <nav className="flex items-center gap-1 bg-neutral-950 p-1 border border-neutral-800 rounded-lg">
          <button
            type="button"
            aria-current={screen === "chat" ? "page" : undefined}
            onClick={() => setScreen("chat")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              screen === "chat"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            aria-current={screen === "models" ? "page" : undefined}
            onClick={() => setScreen("models")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              screen === "models"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Models
          </button>
        </nav>
      </header>

      <main className="flex-1 overflow-hidden">
        {screen === "chat" ? (
          <ChatScreen
            onStartAdding={() => {
              setScreen("models");
              setStartAdding(true);
            }}
            onNavigateToModels={() => setScreen("models")}
          />
        ) : (
          <ModelsScreen
            startAdding={startAdding}
            onAddFinished={() => setStartAdding(false)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
