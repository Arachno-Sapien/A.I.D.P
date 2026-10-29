import { useEffect, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { commands } from "./lib/bindings";
import { ChatScreen } from "./features/chat/ChatScreen";
import { ModelsScreen } from "./features/models/ModelsScreen";
import { useModelsStore } from "./features/models/store";
import { WorkspaceScreen } from "./features/workspace/WorkspaceScreen";
import { useWorkspaceStore } from "./features/workspace/store";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<"chat" | "workspace" | "models">("chat");
  const [hasVisitedWorkspace, setHasVisitedWorkspace] = useState(false);
  const [startAdding, setStartAdding] = useState(false);
  const [quitPrompt, setQuitPrompt] = useState(false);

  const { tabs, dirtyPrompt, saveAll, discardAndProceed, cancelPrompt } =
    useWorkspaceStore();

  useEffect(() => {
    void useModelsStore.getState().refresh();
    const channel = new Channel<boolean>();
    channel.onmessage = (closeRequested) => {
      if (closeRequested) {
        setQuitPrompt(true);
      }
    };
    void commands.watchClose(channel);
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

      {/* Quit Prompt Modal */}
      {quitPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-2xl text-neutral-100">
            <h3 className="text-base font-semibold mb-2">Unsaved changes</h3>
            <p className="text-sm text-neutral-400 mb-6">
              You have unsaved changes in {tabs.filter((t) => t.dirty).length}{" "}
              {tabs.filter((t) => t.dirty).length === 1 ? "file" : "files"}.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setQuitPrompt(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void commands.quitApp()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 transition-colors cursor-pointer"
              >
                Discard and quit
              </button>
              <button
                type="button"
                onClick={async () => {
                  // Quit only if every file was written; otherwise the conflict stays on screen.
                  if (await saveAll()) {
                    await commands.quitApp();
                  } else {
                    setQuitPrompt(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-white text-neutral-900 transition-colors cursor-pointer"
              >
                Save all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Switch / Close Dirty Prompt Modal */}
      {dirtyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-2xl text-neutral-100">
            <h3 className="text-base font-semibold mb-2">Unsaved changes</h3>
            <p className="text-sm text-neutral-400 mb-6">
              You have unsaved changes in {tabs.filter((t) => t.dirty).length}{" "}
              {tabs.filter((t) => t.dirty).length === 1 ? "file" : "files"}.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelPrompt}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void discardAndProceed()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await saveAll()) {
                    await discardAndProceed();
                  } else {
                    cancelPrompt();
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-white text-neutral-900 transition-colors cursor-pointer"
              >
                Save all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
