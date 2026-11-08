/**
 * Error checking in the code editor: a squiggly underline under each problem,
 * its message on hover, and a problem count below the editor (F8 goes to the
 * next problem, Ctrl+Shift+M lists them all).
 *
 * A checker finds the problems in one kind of file. To add or upgrade one
 * (type errors from TypeScript, a language server reached through Rust), write
 * a `Checker` and list it in `CHECKERS` above any checker it replaces. Nothing
 * else changes: the editor only calls `diagnostics(filename)`. Decisions 0022
 * and 0023 record which languages are checked and why.
 */
import {
  diagnosticCount,
  linter,
  openLintPanel,
  type Diagnostic,
} from "@codemirror/lint";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView, showPanel, type Panel, type ViewUpdate } from "@codemirror/view";
import { syntaxChecker } from "./syntax";
import { typescriptChecker } from "./typescript";

export interface Checker {
  /** Shown with each message, so the user knows which checker found it. */
  name: string;
  /** Whether this checker reads the file; `filename` is a base name like `main.rs`. */
  appliesTo(filename: string): boolean;
  /** The problems in the document. May be async, for checkers in a worker or in Rust. */
  check(
    state: EditorState,
    filename: string,
  ): readonly Diagnostic[] | Promise<readonly Diagnostic[]>;
  /** Whether to check again without an edit: the parser read further, new results arrived. */
  refresh?(update: ViewUpdate): boolean;
}

/** In order of preference: a file gets the first checker that reads it, and only that one. */
const CHECKERS: readonly Checker[] = [typescriptChecker, syntaxChecker];

/** More than this many problems in a file is noise; the count then says "100+". */
const MAX_PROBLEMS = 100;

export function checkerFor(filename: string): Checker | undefined {
  return CHECKERS.find((c) => c.appliesTo(filename));
}

/** The editor extension for `filename`: nothing when no checker reads it. */
export function diagnostics(filename: string): Extension {
  const checker = checkerFor(filename);
  if (!checker) return [];
  return [
    linter(
      async (view) =>
        (await checker.check(view.state, filename))
          .slice(0, MAX_PROBLEMS)
          .map((d) => ({ ...d, source: checker.name })),
      { needsRefresh: (update) => checker.refresh?.(update) ?? false },
    ),
    showPanel.of(countPanel),
    countTheme,
  ];
}

function countLabel(count: number): string {
  if (count === 0) return "No problems";
  if (count >= MAX_PROBLEMS) return `${MAX_PROBLEMS}+ problems`;
  return count === 1 ? "1 problem" : `${count} problems`;
}

/** The line below a checked file. Shown with no problems too, so it's clear the file is checked. */
function countPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-problem-count";
  const button = dom.appendChild(document.createElement("button"));
  button.type = "button";
  button.title = "List the problems (Ctrl+Shift+M). F8 goes to the next one.";
  button.onclick = () => openLintPanel(view);
  // Read on every update: an edit that deletes a problem's text removes it before the next check.
  const show = (state: EditorState) => {
    const count = diagnosticCount(state);
    button.textContent = countLabel(count);
    button.classList.toggle("cm-problem-count-some", count > 0);
  };
  show(view.state);
  return { dom, update: (update) => show(update.state) };
}

const countTheme = EditorView.baseTheme({
  ".cm-problem-count": { padding: "2px 8px", fontSize: "11px" },
  ".cm-problem-count button": {
    background: "none",
    border: "none",
    padding: "0",
    font: "inherit",
    color: "inherit",
    opacity: "0.7",
    cursor: "pointer",
  },
  ".cm-problem-count button.cm-problem-count-some": { opacity: "1" },
  "&dark .cm-problem-count button.cm-problem-count-some": { color: "#ff8a80" },
  "&light .cm-problem-count button.cm-problem-count-some": { color: "#b3261e" },
  ".cm-problem-count button:focus-visible": { outline: "1px solid currentColor" },
});
