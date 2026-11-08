/**
 * The Web Worker that holds TypeScript's parser, so loading the compiler and
 * parsing big files never stall typing. Started by `typescript.ts`.
 * In: `{ id, filename, text }`. Out: `{ id, problems }`.
 */
import ts from "typescript";
import { createTypeScriptSyntax, type Problem } from "./typescriptSyntax";

const parse = createTypeScriptSyntax(ts);

self.onmessage = (e: MessageEvent<{ id: number; filename: string; text: string }>) => {
  const { id, filename, text } = e.data;
  let problems: Problem[] = [];
  try {
    problems = parse(filename, text);
  } catch {
    // A parser crash on one file shows no problems for it; the editor keeps working.
  }
  self.postMessage({ id, problems });
};
