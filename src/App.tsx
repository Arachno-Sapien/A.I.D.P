import { useEffect, useState } from "react";
import { ChatScreen } from "./features/chat/ChatScreen";
import { ModelsScreen } from "./features/models/ModelsScreen";
import { useModelsStore } from "./features/models/store";
import { WorkspaceScreen } from "./features/workspace/WorkspaceScreen";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<"chat" | "workspace" | "models">("chat");
  const [hasVisitedWorkspace, setHasVisitedWorkspace] = useState(false);
  const [startAdding, setStartAdding] = useState(false);

  useEffect(() => {
    void useModelsStore.getState().refresh();
  }, []);

  const handleSelectScreen = (next: "chat" | "workspace" | "models") => {
    if (next === "workspace") {
      setHasVisitedWorkspace(true);
    }
    setScreen(next);
  };

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
            onClick={() => handleSelectScreen("chat")}
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
            aria-current={screen === "workspace" ? "page" : undefined}
            onClick={() => handleSelectScreen("workspace")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              screen === "workspace"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Workspace
          </button>
          <button
            type="button"
            aria-current={screen === "models" ? "page" : undefined}
            onClick={() => handleSelectScreen("models")}
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

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {screen === "chat" && (
          <ChatScreen
            onStartAdding={() => {
              handleSelectScreen("models");
              setStartAdding(true);
            }}
            onNavigateToModels={() => handleSelectScreen("models")}
          />
        )}
        {hasVisitedWorkspace && (
          <div
            data-testid="workspace-container"
            className={`flex-1 flex flex-col h-full ${
              screen === "workspace" ? "" : "hidden"
            }`}
          >
            <WorkspaceScreen />
          </div>
        )}
        {screen === "models" && (
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
