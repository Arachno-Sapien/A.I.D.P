/**
 * Syntax errors from TypeScript's own parser, one file at a time. Runs in the
 * worker (`typescriptWorker.ts`); `ts` is passed in so this file never pulls
 * the 9 MB compiler into the main bundle.
 *
 * It is a language service that knows no other file, so it reports syntax
 * only. Given the folder's files and TypeScript's lib files, the same service
 * could report type errors too (`getSemanticDiagnostics`).
 */
import type ts from "typescript";
import type { Diagnostic } from "@codemirror/lint";

export type Problem = Pick<Diagnostic, "from" | "to" | "severity" | "message">;

export function createTypeScriptSyntax(
  typescript: typeof ts,
): (filename: string, text: string) => Problem[] {
  let name = "";
  let source = "";
  let version = 0;
  const service = typescript.createLanguageService({
    getScriptFileNames: () => [name],
    getScriptVersion: () => String(version),
    getScriptSnapshot: (f) =>
      f === name ? typescript.ScriptSnapshot.fromString(source) : undefined,
    getCurrentDirectory: () => "/",
    // No lib files and no imports: syntax doesn't need them.
    getCompilationSettings: () => ({
      noLib: true,
      noResolve: true,
      allowJs: true,
      jsx: typescript.JsxEmit.Preserve,
      target: typescript.ScriptTarget.ESNext,
    }),
    getDefaultLibFileName: () => "/lib.d.ts",
    fileExists: (f) => f === name,
    readFile: (f) => (f === name ? source : undefined),
  });

  const severity = (category: ts.DiagnosticCategory): Problem["severity"] =>
    category === typescript.DiagnosticCategory.Error
      ? "error"
      : category === typescript.DiagnosticCategory.Warning
        ? "warning"
        : "info";

  return (filename, text) => {
    // The extension tells TypeScript the kind: .ts, .tsx, .js, .jsx, .d.ts, .mts …
    name = `/${filename}`;
    source = text;
    version++;
    return service.getSyntacticDiagnostics(name).map((d) => {
      const from = d.start ?? 0;
      return {
        from,
        to: from + (d.length ?? 0),
        severity: severity(d.category),
        message: typescript.flattenDiagnosticMessageText(d.messageText, "\n"),
      };
    });
  };
}
