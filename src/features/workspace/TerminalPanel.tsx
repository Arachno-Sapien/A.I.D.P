import { Channel } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { commands, type ServerInfo, type TerminalEvent } from "../../lib/bindings";
import { useSettingsStore } from "../settings/store";
import { THEMES } from "../settings/themes";
import { useWorkspaceStore } from "./store";
import { mountTerminal, type MountedTerminal } from "./term";
import { workspaceErrorText } from "./workspaceErrorText";

// Rust keeps one terminal and each open replaces it, so opens and closes must
// reach it in the order they were made: in dev, StrictMode opens, closes and
// opens again at once, and a folder change closes then opens.
let pending: Promise<unknown> = Promise.resolve();
function inOrder<T>(call: () => Promise<T>): Promise<T> {
  const next = pending.then(call, call);
  pending = next.catch(() => undefined);
  return next;
}

function useTerminalTheme() {
  const resolved = useSettingsStore((s) => s.resolved);
  const cursor = useSettingsStore((s) =>
    s.theme === "cyber" ? THEMES.cyber.vars["--color-accent"] : undefined,
  );
  return { resolved, cursor };
}

function shortCommand(command: string): string {
  return command.length > 30 ? `${command.slice(0, 29)}…` : command;
}

/** A server the agent started, read-only: its kept output, then what it prints next. */
function ServerView({ id, onExit }: { id: number; onExit: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolved, cursor } = useTerminalTheme();
  const termRef = useRef<MountedTerminal | null>(null);
  // Read when the view mounts; later theme changes go through setTheme.
  const themeRef = useRef({ resolved, cursor });

  useEffect(() => {
    termRef.current?.setTheme(resolved, cursor);
  }, [resolved, cursor]);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = mountTerminal(containerRef.current, {
      theme: themeRef.current.resolved,
      cursor: themeRef.current.cursor,
      onInput: () => {},
      onResize: () => {},
    });
    termRef.current = term;
    let live = true;
    const channel = new Channel<TerminalEvent>();
    channel.onmessage = (ev: TerminalEvent) => {
      if (!live) return;
      if (ev.event === "output") {
        term.write(ev.data);
      } else if (ev.event === "exit") {
        term.write("\r\n[server exited]");
        onExit();
      }
    };
    void commands.serverAttach(id, channel);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => term.fit());
      ro.observe(containerRef.current);
    }
    return () => {
      live = false;
      ro?.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [id, onExit]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export interface TerminalPanelProps {
  height?: number;
  onHeightChange?: (height: number) => void;
  onClose?: () => void;
}

export function TerminalPanel({
  height,
  onHeightChange,
  onClose,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<MountedTerminal | null>(null);
  // Events from a replaced shell (its exit above all) must not reach the screen.
  const channelRef = useRef<Channel<TerminalEvent> | null>(null);
  const [isExited, setIsExited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const serverTab = useWorkspaceStore((s) => s.serverTab);
  const serversVersion = useWorkspaceStore((s) => s.serversVersion);
  const { setServerTab, refreshServers } = useWorkspaceStore.getState();
  const { resolved, cursor } = useTerminalTheme();

  useEffect(() => {
    termRef.current?.setTheme(resolved, cursor);
  }, [resolved, cursor]);

  useEffect(() => {
    let live = true;
    void commands.serverList().then((list) => {
      if (live) setServers(list);
    });
    return () => {
      live = false;
    };
  }, [serversVersion]);

  const startTerminal = useCallback(async () => {
    if (!termRef.current) return;
    setIsExited(false);
    setError(null);
    const channel = new Channel<TerminalEvent>();
    channelRef.current = channel;
    channel.onmessage = (ev: TerminalEvent) => {
      if (channelRef.current !== channel) return;
      if (ev.event === "output") {
        termRef.current?.write(ev.data);
      } else if (ev.event === "exit") {
        termRef.current?.write("\r\n[process exited]");
        setIsExited(true);
      }
    };
    const { cols, rows } = termRef.current;
    const res = await inOrder(() => commands.terminalOpen(cols, rows, channel));
    if (res.status === "error" && channelRef.current === channel) {
      setError(workspaceErrorText(res.error));
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = mountTerminal(containerRef.current, {
      theme: resolved,
      cursor,
      onInput: (data) => {
        void commands.terminalWrite(data);
      },
      onResize: (cols, rows) => {
        void commands.terminalResize(cols, rows);
      },
    });
    termRef.current = term;

    void startTerminal();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        term.fit();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      ro?.disconnect();
      term.dispose();
      termRef.current = null;
      channelRef.current = null;
      void inOrder(() => commands.terminalClose());
    };
  }, [startTerminal]);

  // Resizing via drag handle
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY;
      const minHeight = 100;
      const maxHeight = Math.floor(windowHeight * 0.6);
      const clamped = Math.max(minHeight, Math.min(maxHeight, newHeight));
      onHeightChange?.(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onHeightChange]);

  const showing = servers.some((s) => s.id === serverTab) ? serverTab : null;
  const stopServer = async (id: number) => {
    await commands.serverStop(id);
    if (useWorkspaceStore.getState().serverTab === id) setServerTab(null);
    refreshServers();
  };
  const tabClass = (selected: boolean) =>
    `px-2 py-0.5 rounded cursor-pointer ${selected ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"}`;

  return (
    <div
      style={height ? { height } : undefined}
      className={`flex flex-col bg-neutral-950 border-t border-neutral-800 text-neutral-100 select-none overflow-hidden shrink-0 ${height ? "" : "h-60"}`}
    >
      {/* Resizing handle */}
      <div
        onMouseDown={() => setIsDragging(true)}
        className="h-1 w-full hover:bg-neutral-600 active:bg-neutral-500 cursor-row-resize transition-colors"
      />

      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1 bg-neutral-900/60 border-b border-neutral-800/80 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div role="tablist" aria-label="Terminals" className="flex items-center gap-1 min-w-0 overflow-x-auto">
            <button
              type="button"
              role="tab"
              aria-selected={showing === null}
              onClick={() => setServerTab(null)}
              className={`font-semibold ${tabClass(showing === null)}`}
            >
              Terminal
            </button>
            {servers.map((server) => (
              <span key={server.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={showing === server.id}
                  title={server.command}
                  onClick={() => setServerTab(server.id)}
                  className={`flex items-center gap-1.5 font-mono ${tabClass(showing === server.id)}`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block w-1.5 h-1.5 rounded-full ${server.running ? "bg-green-500" : "bg-neutral-500"}`}
                  />
                  {shortCommand(server.command)}
                </button>
                <button
                  type="button"
                  aria-label={`Stop ${server.command}`}
                  title={server.running ? "Stop the server" : "Close"}
                  onClick={() => void stopServer(server.id)}
                  className="px-1 text-neutral-500 hover:text-neutral-200 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {error && (
            <span className="text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-800/40 text-[11px]">
              {error}
            </span>
          )}
          {isExited && showing === null && (
            <div className="flex items-center gap-2 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 text-[11px]">
              <span>Process exited.</span>
              <button
                type="button"
                onClick={() => void startTerminal()}
                className="underline hover:text-amber-200 cursor-pointer font-medium"
              >
                Restart
              </button>
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close terminal"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 px-1 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            ×
          </button>
        )}
      </div>

      {/* The shell stays mounted while a server tab is shown, so it keeps running. */}
      <div
        ref={containerRef}
        className={`flex-1 p-2 overflow-hidden bg-neutral-950 ${showing === null ? "" : "hidden"}`}
      />
      {showing !== null && (
        <div className="flex-1 p-2 overflow-hidden bg-neutral-950">
          <ServerView id={showing} onExit={refreshServers} />
        </div>
      )}
    </div>
  );
}

export default TerminalPanel;
