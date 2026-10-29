import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { buffers } from "./buffers";
import { mountView } from "./cm";
import { useWorkspaceStore } from "./store";

export function EditorPane() {
  const {
    tabs,
    active,
    revision,
    conflict,
    setActive,
    save,
    reload,
    closeTab,
  } = useWorkspaceStore();

  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const activeTab = tabs.find((t) => t.path === active);

  // One EditorView shows the active tab's buffer. Edits flow back into the
  // buffer through the state's listener; `revision` brings in a buffer the
  // store replaced (reload, Accept).
  useEffect(() => {
    if (!active) {
      viewRef.current?.destroy();
      viewRef.current = null;
      return;
    }

    const container = editorContainerRef.current;
    const state = buffers.get(active);
    if (!container || !state) return;

    if (!viewRef.current) {
      viewRef.current = mountView(container, state);
    } else if (viewRef.current.state !== state) {
      viewRef.current.setState(state);
    }
  }, [active, revision]);

  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  const handleClose = (path: string, dirty: boolean) => {
    if (dirty) {
      setConfirmDiscard(path);
    } else {
      closeTab(path);
    }
  };

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-xs select-none">
        No file open
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* Tab Strip */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 overflow-x-auto select-none">
        <div className="flex items-center">
          {tabs.map((tab) => {
            const isActive = tab.path === active;
            return (
              <div
                key={tab.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 border-r border-neutral-800 text-xs font-mono cursor-pointer transition-colors ${
                  isActive
                    ? "bg-neutral-950 text-neutral-100 border-b-2 border-b-blue-500"
                    : "bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                }`}
                onClick={() => setActive(tab.path)}
              >
                <span>{tab.name}</span>
                {tab.dirty && (
                  <span
                    data-testid={`dirty-dot-${tab.path}`}
                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                  />
                )}
                <button
                  type="button"
                  aria-label={`Close ${tab.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(tab.path, tab.dirty);
                  }}
                  className="ml-1 text-neutral-500 hover:text-neutral-300 p-0.5 rounded hover:bg-neutral-700/60 transition-colors"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {activeTab && (
          <div className="px-3 py-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save(activeTab.path)}
              className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* Discard Confirmation Banner */}
      {confirmDiscard && (
        <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center justify-between text-xs">
          <span className="text-neutral-300">Discard unsaved changes?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                closeTab(confirmDiscard);
                setConfirmDiscard(null);
              }}
              className="px-2.5 py-1 rounded bg-red-900/60 text-red-200 hover:bg-red-800 transition-colors cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscard(null)}
              className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Conflict Bar */}
      {conflict && conflict.path === active && (
        <div className="bg-amber-950/80 border-b border-amber-800/80 px-4 py-2 flex items-center justify-between text-xs">
          {conflict.kind === "changedOnDisk" ? (
            <>
              <span className="text-amber-200">
                This file changed on disk.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save(conflict.path, { overwrite: true })}
                  className="px-2.5 py-1 rounded bg-neutral-800 text-amber-200 hover:bg-neutral-700 transition-colors cursor-pointer font-medium"
                >
                  Overwrite
                </button>
                <button
                  type="button"
                  onClick={() => void reload(conflict.path)}
                  className="px-2.5 py-1 rounded bg-amber-900/60 text-amber-200 hover:bg-amber-800 transition-colors cursor-pointer font-medium"
                >
                  Reload
                </button>
              </div>
            </>
          ) : (
            <span className="text-amber-200">
              The file was deleted or moved. Copy your changes before closing the tab.
            </span>
          )}
        </div>
      )}

      {/* Editor view container */}
      <div
        ref={editorContainerRef}
        className="flex-1 overflow-auto bg-neutral-950 font-mono text-xs"
      />
    </div>
  );
}

