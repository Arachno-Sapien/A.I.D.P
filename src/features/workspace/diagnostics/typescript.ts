/**
 * JavaScript and TypeScript syntax errors from TypeScript's own parser
 * (decision 0023). The parser lives in a Web Worker, started on the first
 * check and let go after `IDLE_MS` without one, so its memory is only held
 * while JS/TS files are being edited.
 */
import type { Checker } from "./index";
import type { Problem } from "./typescriptSyntax";

/** .js .mjs .cjs .jsx .ts .mts .cts .tsx (and .d.ts). */
const FILES = /\.([mc]?[jt]s|[jt]sx)$/i;

/** The worker holds tens of MB; five minutes without a check lets it go. */
export const IDLE_MS = 5 * 60_000;

let worker: Worker | null = null;
let failed = false;
let nextId = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const waiting = new Map<number, (problems: Problem[]) => void>();

function stop() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
  for (const answer of waiting.values()) answer([]);
  waiting.clear();
}

function start(): Worker {
  const w = new Worker(new URL("./typescriptWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; problems: Problem[] }>) => {
    waiting.get(e.data.id)?.(e.data.problems);
    waiting.delete(e.data.id);
  };
  // A worker that can't load won't load next time either: stay off until the app restarts.
  w.onerror = () => {
    failed = true;
    stop();
  };
  return w;
}

function parse(filename: string, text: string): Promise<Problem[]> {
  if (failed || typeof Worker === "undefined") return Promise.resolve([]);
  const w = (worker ??= start());
  clearTimeout(idleTimer);
  idleTimer = setTimeout(stop, IDLE_MS);
  const id = nextId++;
  return new Promise((answer) => {
    waiting.set(id, answer);
    w.postMessage({ id, filename, text });
  });
}

export const typescriptChecker: Checker = {
  name: "TypeScript",
  appliesTo: (filename) => FILES.test(filename),
  check: (state, filename) => parse(filename, state.doc.toString()),
};
