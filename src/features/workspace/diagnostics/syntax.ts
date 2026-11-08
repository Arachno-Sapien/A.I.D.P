/**
 * Syntax errors from the grammar the editor already uses for colouring: no
 * extra download, no process, works offline. It finds broken syntax only
 * (a stray brace, a missing comma), not type errors or unknown names.
 */
import {
  ensureSyntaxTree,
  LanguageDescription,
  syntaxTree,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { Checker } from "./index";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/**
 * Languages whose grammar read real, valid code without false errors (decision
 * 0022). Left out because the grammar flags valid code: JavaScript and
 * TypeScript (`export { type X }`, `p is T`, import attributes; checked by
 * `typescript.ts` instead), Python (bare `yield`, `1.`), CSS (Tailwind's
 * `@apply`), HTML (template tags), C and C++ (macros).
 */
const CHECKED = new Set(["Rust", "JSON", "YAML", "XML"]);

/** JSON files that allow comments, which the JSON grammar reads as errors. */
const JSON_WITH_COMMENTS =
  /^(tsconfig|jsconfig)(\..+)?\.json$|^(\.eslintrc|\.?devcontainer|settings|launch|tasks|extensions|keybindings|turbo|deno)\.json$|\.jsonc$/i;

/** How long one check may parse; a file not parsed to its end by then is checked once it is. */
const PARSE_MS = 200;

type Problem = Pick<Diagnostic, "from" | "to" | "message">;

export const syntaxChecker: Checker = {
  name: "Syntax",
  appliesTo: (filename) =>
    CHECKED.has(LanguageDescription.matchFilename(languages, filename)?.name ?? "") &&
    !JSON_WITH_COMMENTS.test(filename),
  check(state) {
    // A tree cut off part way can end in errors that aren't in the code, so wait for all of it.
    const tree = ensureSyntaxTree(state, state.doc.length, PARSE_MS);
    if (!tree) return [];
    const found: Diagnostic[] = [];
    tree.iterate({
      enter: (node) => {
        const problem = describe(state, node.node);
        // One mistake can leave several errors in the same place; keep the first.
        if (problem && problem.from !== found[found.length - 1]?.from) {
          found.push({ ...problem, severity: "error" });
        }
      },
    });
    return found;
  },
  // The editor parses in the background; check again once it has read further.
  refresh: (update) => syntaxTree(update.startState) !== syntaxTree(update.state),
};

function describe(state: EditorState, node: SyntaxNode): Problem | null {
  if (node.type.isError) return unexpected(state, node.from, node.to);
  // XML marks tag mistakes with nodes of their own instead of error nodes.
  if (node.name === "MismatchedCloseTag") {
    return { from: node.from, to: node.to, message: `${quote(state, node.from, node.to)} has no matching open tag` };
  }
  if (node.name === "MissingCloseTag") {
    const open = node.parent?.firstChild;
    if (!open) return null;
    return { from: open.from, to: open.to, message: `${quote(state, open.from, open.to)} is never closed` };
  }
  return null;
}

/** An error node either covers text the parser skipped or marks, with no width, where it got stuck. */
function unexpected(state: EditorState, from: number, to: number): Problem {
  if (to > from) return { from, to, message: `Unexpected ${quote(state, from, to)}` };
  const end = state.doc.length;
  const ahead = state.sliceDoc(from, Math.min(from + 200, end));
  const token = /[\p{L}\p{N}_$]+|\S/u.exec(ahead);
  if (!token) {
    const atEnd = from + ahead.length >= end;
    return { from, to: from, message: atEnd ? "Unexpected end of file" : "Syntax error" };
  }
  const start = from + token.index;
  return { from: start, to: start + token[0].length, message: `Unexpected ${quote(state, start, start + token[0].length)}` };
}

function quote(state: EditorState, from: number, to: number): string {
  const text = state.sliceDoc(from, to).trim().split("\n")[0];
  return `"${text.length > 20 ? `${text.slice(0, 20)}…` : text}"`;
}
