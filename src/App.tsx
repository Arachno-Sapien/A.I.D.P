import { useEffect, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { Boxes, FolderCode, MessageSquare, Settings } from "lucide-react";
import { commands, type Attachments_Deserialize } from "./lib/bindings";
import { useChatStore } from "./features/chat/store";
import { useWorkspaceChatStore } from "./features/workspace/chatStore";
import { ChatScreen } from "./features/chat/ChatScreen";
import { ModelsScreen } from "./features/models/ModelsScreen";
import { useModelsStore } from "./features/models/store";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { useSettingsStore } from "./features/settings/store";
import { UpdateBar } from "./features/settings/UpdateBar";
import { START_CHECK_DELAY_MS, useUpdatesStore } from "./features/settings/updates";
import { UnsavedChangesDialog } from "./features/workspace/UnsavedChangesDialog";
import { WorkspaceScreen } from "./features/workspace/WorkspaceScreen";
import { useWorkspaceStore } from "./features/workspace/store";
import appIcon from "../src-tauri/icons/128x128.png";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<
    "chat" | "workspace" | "models" | "settings"
  >("chat");
  const [hasVisitedWorkspace, setHasVisitedWorkspace] = useState(false);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  const [startAdding, setStartAdding] = useState(false);
  const [quitPrompt, setQuitPrompt] = useState(false);

  const { tabs, dirtyPrompt, saveAll, discardAndProceed, cancelPrompt } =
    useWorkspaceStore();

  useEffect(() => {
    void useModelsStore.getState().refreshOllama();
    // One quiet update check, a little after start, when the setting allows it.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void useSettingsStore
      .getState()
      .load()
      .then(() => {
        if (stopped || !useSettingsStore.getState().checkUpdatesAtStart) return;
        timer = setTimeout(
          () => void useUpdatesStore.getState().check(true),
          START_CHECK_DELAY_MS,
        );
      });
    const channel = new Channel<boolean>();
    channel.onmessage = (closeRequested) => {
      if (closeRequested) {
        setQuitPrompt(true);
      }
    };
    void commands.watchClose(channel);
    // Files dropped on the window are read by Rust; they join the chat on screen.
    const drops = new Channel<Attachments_Deserialize>();
    drops.onmessage = ({ added, refused }) => {
      const target =
        screenRef.current === "chat"
          ? useChatStore
          : screenRef.current === "workspace"
            ? useWorkspaceChatStore
            : null;
      target?.getState().addAttachments(added, refused);
    };
    void commands.watchDrops(drops);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const handleSelectScreen = (
    next: "chat" | "workspace" | "models" | "settings",
  ) => {
    if (next === "workspace") {
      setHasVisitedWorkspace(true);
    }
    setScreen(next);
  };

  return (
    <div className="app-shell flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans">
      <header className="app-surface flex items-center justify-between px-6 py-2.5 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
        <img
          src={appIcon}
          alt="A.I.D.P"
          width={28}
          height={28}
          className="h-7 w-7"
          draggable={false}
        />
        <nav className="flex items-center gap-1 bg-neutral-950 p-1 border border-neutral-800 rounded-lg">
          <button
            type="button"
            aria-current={screen === "chat" ? "page" : undefined}
            onClick={() => handleSelectScreen("chat")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              screen === "chat"
                ? "app-accent bg-accent/20 text-neutral-50"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <MessageSquare size={16} aria-hidden="true" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            aria-current={screen === "workspace" ? "page" : undefined}
            onClick={() => handleSelectScreen("workspace")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              screen === "workspace"
                ? "app-accent bg-accent/20 text-neutral-50"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <FolderCode size={16} aria-hidden="true" />
            <span>Workspace</span>
          </button>
          <button
            type="button"
            aria-current={screen === "models" ? "page" : undefined}
            onClick={() => handleSelectScreen("models")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              screen === "models"
                ? "app-accent bg-accent/20 text-neutral-50"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Boxes size={16} aria-hidden="true" />
            <span>Models</span>
          </button>
          <button
            type="button"
            aria-current={screen === "settings" ? "page" : undefined}
            onClick={() => handleSelectScreen("settings")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              screen === "settings"
                ? "app-accent bg-accent/20 text-neutral-50"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Settings size={16} aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>
      </header>
      <UpdateBar />

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {screen === "chat" && (
          <ChatScreen
            active={screen === "chat"}
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
            <WorkspaceScreen active={screen === "workspace"} />
          </div>
        )}
        {screen === "models" && (
          <ModelsScreen
            startAdding={startAdding}
            onAddFinished={() => setStartAdding(false)}
          />
        )}
        {screen === "settings" && <SettingsScreen />}
      </main>

      {quitPrompt && (
        <UnsavedChangesDialog
          count={tabs.filter((t) => t.dirty).length}
          discardLabel="Discard and quit"
          onCancel={() => setQuitPrompt(false)}
          onDiscard={() => void commands.quitApp()}
          onSaveAll={async () => {
            // Quit only if every file was written; otherwise the conflict stays on screen.
            if (await saveAll()) {
              await commands.quitApp();
            } else {
              setQuitPrompt(false);
            }
          }}
        />
      )}

      {/* Leaving or switching the folder */}
      {dirtyPrompt && (
        <UnsavedChangesDialog
          count={tabs.filter((t) => t.dirty).length}
          discardLabel="Discard"
          onCancel={cancelPrompt}
          onDiscard={() => void discardAndProceed()}
          onSaveAll={async () => {
            if (await saveAll()) {
              await discardAndProceed();
            } else {
              cancelPrompt();
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
