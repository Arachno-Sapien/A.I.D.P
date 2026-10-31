import React, { Suspense, useEffect, useRef, useState } from "react";
import { AiPanel } from "./AiPanel";
import { useWorkspaceChatStore } from "./chatStore";
import { DiffView } from "./DiffView";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { Splitter } from "./Splitter";
import { useWorkspaceStore } from "./store";
import { awaitsAnswer } from "./ToolStepView";

const LazyTerminalPanel = React.lazy(() => import("./TerminalPanel"));

const FILES_WIDTH = 280;
const FILES_MIN = 160;
const AI_WIDTH = 380;
const AI_MIN = 280;
/** Dragging a panel never leaves the editor narrower than this. */
const EDITOR_MIN = 200;

const toggleClass = (on: boolean) =>
  `text-xs px-2 py-1 rounded transition-colors cursor-pointer ${
    on
      ? "bg-neutral-800 text-neutral-100"
      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
  }`;

export interface WorkspaceScreenProps {
  /** Whether the workspace is the screen shown; its shortcuts act only then. */
  active?: boolean;
}

export function WorkspaceScreen({ active = true }: WorkspaceScreenProps) {
  const {
    info,
    recent,
    children,
    expanded,
    error,
    proposal,
    loadRecent,
    openFolder,
    openRecent,
    closeFolder,
    toggleDir,
    refreshTree,
    clearError,
    openFile,
  } = useWorkspaceStore();

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState<number>(240);
  const [filesOpen, setFilesOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [filesWidth, setFilesWidth] = useState(FILES_WIDTH);
  const [aiWidth, setAiWidth] = useState(AI_WIDTH);
  const columnsRef = useRef<HTMLDivElement>(null);

  // A command waiting for approval must be seen, so it brings the AI panel back.
  const awaiting = useWorkspaceChatStore((s) =>
    s.messages.some((m) =>
      m.parts?.some((p) => p.kind === "step" && awaitsAnswer(p.step)),
    ),
  );
  useEffect(() => {
    if (awaiting) setAiOpen(true);
  }, [awaiting]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // A key the editor or terminal already handled is theirs.
      if (!(e.ctrlKey || e.metaKey) || e.defaultPrevented) return;
      if (e.key === "\\") {
        e.preventDefault();
        setTerminalOpen((open) => !open);
      } else if (e.key.toLowerCase() === "b" && !e.shiftKey) {
        e.preventDefault();
        if (e.altKey) setAiOpen((open) => !open);
        else setFilesOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  /** The widest a side panel may get beside the other open panel and the editor. */
  const widest = (other: number) => () =>
    (columnsRef.current?.clientWidth ?? 0) - other - EDITOR_MIN;

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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={filesOpen}
            title="Show or hide the file tree (Ctrl+B)"
            onClick={() => setFilesOpen((open) => !open)}
            className={toggleClass(filesOpen)}
          >
            Files
          </button>
          <button
            type="button"
            aria-pressed={aiOpen}
            title="Show or hide the AI panel (Ctrl+Alt+B)"
            onClick={() => setAiOpen((open) => !open)}
            className={toggleClass(aiOpen)}
          >
            AI
          </button>
          <button
            type="button"
            aria-pressed={terminalOpen}
            title="Show or hide the terminal (Ctrl+\)"
            onClick={() => setTerminalOpen((open) => !open)}
            className={toggleClass(terminalOpen)}
          >
            Terminal
          </button>
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

      {/* Main 3 Columns: the side panels shrink to their minimum before anything overflows */}
      <div ref={columnsRef} className="flex-1 flex min-h-0">
        {/* Left: Tree (hidden, not unmounted, so it keeps its state) */}
        <div
          data-testid="files-panel"
          hidden={!filesOpen}
          className="bg-neutral-900/30 overflow-hidden flex flex-col"
          style={{ flex: `0 1 ${filesWidth}px`, minWidth: FILES_MIN }}
        >
          <FileTree
            childrenMap={children}
            expanded={expanded}
            onToggleDir={(path) => void toggleDir(path)}
            onOpenFile={(path) => void openFile(path)}
          />
        </div>
        {filesOpen && (
          <Splitter
            label="Resize file tree"
            width={filesWidth}
            min={FILES_MIN}
            max={widest(aiOpen ? aiWidth : 0)}
            grow={1}
            onChange={setFilesWidth}
            onReset={() => setFilesWidth(FILES_WIDTH)}
          />
        )}

        {/* Center: Editor or DiffView + Terminal */}
        <div
          className="flex-1 overflow-hidden bg-neutral-950 flex flex-col min-h-0"
          style={{ minWidth: EDITOR_MIN }}
        >
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {proposal ? <DiffView /> : <EditorPane />}
          </div>
          {terminalOpen && (
            <Suspense fallback={<div className="h-60 bg-neutral-950" />}>
              <LazyTerminalPanel
                key={info.path}
                height={terminalHeight}
                onHeightChange={setTerminalHeight}
                onClose={() => setTerminalOpen(false)}
              />
            </Suspense>
          )}
        </div>

        {/* Right: AI Panel */}
        {aiOpen && (
          <Splitter
            label="Resize AI panel"
            width={aiWidth}
            min={AI_MIN}
            max={widest(filesOpen ? filesWidth : 0)}
            grow={-1}
            onChange={setAiWidth}
            onReset={() => setAiWidth(AI_WIDTH)}
          />
        )}
        <div
          data-testid="ai-panel"
          hidden={!aiOpen}
          className="overflow-hidden flex flex-col"
          style={{ flex: `0 1 ${aiWidth}px`, minWidth: AI_MIN }}
        >
          <AiPanel />
        </div>
      </div>
    </div>
  );
}
