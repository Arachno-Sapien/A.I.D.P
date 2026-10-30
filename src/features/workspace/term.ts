import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";

export interface TerminalOpts {
  onInput(data: string): void;
  onResize(cols: number, rows: number): void;
}

export interface MountedTerminal {
  write(data: string): void;
  fit(): void;
  dispose(): void;
  readonly cols: number;
  readonly rows: number;
}

export function mountTerminal(
  el: HTMLElement,
  opts: TerminalOpts,
): MountedTerminal {
  const isWindows =
    typeof navigator !== "undefined" &&
    /windows|win32/i.test(navigator.userAgent);

  const term = new Xterm({
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    scrollback: 1000,
    theme: {
      background: "#0a0a0a",
      foreground: "#e5e5e5",
      cursor: "#f5f5f5",
      selectionBackground: "#333333",
    },
    windowsPty: isWindows ? { backend: "conpty" } : undefined,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(el);

  let prevCols = term.cols;
  let prevRows = term.rows;

  const performFit = () => {
    try {
      fitAddon.fit();
    } catch {
      // Element may be hidden or detached
    }
    if (term.cols !== prevCols || term.rows !== prevRows) {
      prevCols = term.cols;
      prevRows = term.rows;
      opts.onResize(term.cols, term.rows);
    }
  };

  performFit();

  term.onData((data) => {
    opts.onInput(data);
  });

  return {
    write: (data: string) => {
      term.write(data);
    },
    fit: performFit,
    dispose: () => {
      term.dispose();
    },
    get cols() {
      return term.cols;
    },
    get rows() {
      return term.rows;
    },
  };
}
