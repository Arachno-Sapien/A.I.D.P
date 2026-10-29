import { useEffect } from "react";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { useWorkspaceStore } from "./store";

export function WorkspaceScreen() {
  const {
    info,
    recent,
    children,
    expanded,
    error,
    loadRecent,
    openFolder,
    openRecent,
    closeFolder,
    toggleDir,
    refreshTree,
    clearError,
    openFile,
  } = useWorkspaceStore();

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  if (!info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-100">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl text-center">
          <h2 className="text-base font-semibold text-white mb-2">
            No folder open
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            Open a folder to edit code and work with AI in your workspace.
          </p>
          <button
            type="button"
            onClick={() => void openFolder()}
            className="px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            Open folder
          </button>

          {recent.length > 0 && (
            <div className="mt-8 text-left border-t border-neutral-800 pt-6">
              <h3 className="text-xs font-medium text-neutral-400 mb-3">
                Recent folders
              </h3>
              <ul className="space-y-1.5 text-xs">
                {recent.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => void openRecent(path)}
                      className="w-full text-left font-mono truncate px-2 py-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="mt-4 p-2 rounded bg-red-950/60 border border-red-900/60 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Top Workspace Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-xs text-neutral-200 truncate">
            {info.name}
          </span>
          <span className="text-[11px] font-mono text-neutral-500 truncate">
            {info.path}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshTree()}
            className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void closeFolder()}
            className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Close folder
          </button>
        </div>
      </div>

      {/* No Git Banner */}
      {!info.isGit && (
        <div className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between">
          <span>
            This folder isn't a git repository. AI edits can't be undone easily.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-950/60 border-b border-red-800/60 px-4 py-1.5 text-xs text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-xs text-red-400 hover:text-red-200 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 3 Columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Tree */}
        <div className="w-[280px] shrink-0 border-r border-neutral-800 bg-neutral-900/30 overflow-hidden flex flex-col">
          <FileTree
            childrenMap={children}
            expanded={expanded}
            onToggleDir={(path) => void toggleDir(path)}
            onOpenFile={(path) => void openFile(path)}
          />
        </div>

        {/* Center: Editor */}
        <div className="flex-1 overflow-hidden bg-neutral-950 flex flex-col">
          <EditorPane />
        </div>

        {/* Right: AI Panel placeholder */}
        <div className="w-[380px] shrink-0 border-l border-neutral-800 bg-neutral-900/30 overflow-hidden flex items-center justify-center text-neutral-600 text-xs select-none">
          Workspace AI
        </div>
      </div>
    </div>
  );
}
