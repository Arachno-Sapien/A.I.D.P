import { Highlight, themes } from "prism-react-renderer";
import {
  type ComponentPropsWithoutRef,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSettingsStore } from "../settings/store";

// Memoized: a finished block keeps its props while the reply around it
// grows, so its code isn't highlighted again on every streamed chunk.
const CodeBlock = memo(function CodeBlock({
  code,
  language,
  onApply,
  applyDisabled,
}: {
  code: string;
  language: string;
  onApply?: (code: string, language: string) => void;
  applyDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // Code colours follow the theme's base, as the editor's do.
  const resolved = useSettingsStore((s) => s.resolved);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // the clipboard was refused: don't claim "Copied"
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-2 overflow-hidden rounded bg-neutral-900 text-sm">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-400">
        <span>{language || "text"}</span>
        <div className="flex items-center gap-2">
          {onApply && (
            <button
              type="button"
              disabled={applyDisabled}
              onClick={() => onApply(code, language)}
              className="cursor-pointer rounded px-2 py-0.5 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="cursor-pointer rounded px-2 py-0.5 hover:bg-neutral-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <Highlight
        theme={resolved === "light" ? themes.oneLight : themes.oneDark}
        code={code}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} overflow-x-auto p-3`} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
});

const REMARK_PLUGINS = [remarkGfm];

// The reply-md class carries the heading, list and spacing styles in App.css.
export function Markdown({
  text,
  onApply,
  applyDisabled,
}: {
  text: string;
  onApply?: (code: string, language: string) => void;
  applyDisabled?: boolean;
}) {
  // One `components` object for as long as it can be: a new `code` function
  // is a new component type to React, which would throw away and rebuild every
  // code block on each render. `onApply` changes with every chunk (it closes
  // over the message), so the blocks get one that never changes instead.
  const latestApply = useRef(onApply);
  latestApply.current = onApply;
  const apply = useCallback(
    (code: string, language: string) => latestApply.current?.(code, language),
    [],
  );
  const canApply = Boolean(onApply);
  const components = useMemo(
    () => ({
      code: ({
        className,
        children,
        ...props
      }: ComponentPropsWithoutRef<"code">) => {
        const raw = String(children ?? "");
        const isBlock = Boolean(
          className?.startsWith("language-") || raw.includes("\n"),
        );

        if (isBlock) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const code = raw.replace(/\n$/, "");
          return (
            <CodeBlock
              code={code}
              language={language}
              onApply={canApply ? apply : undefined}
              applyDisabled={applyDisabled}
            />
          );
        }

        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      a: ({ href, children }: ComponentPropsWithoutRef<"a">) => (
        <span title={href} className="underline">
          {children}
        </span>
      ),
    }),
    [apply, canApply, applyDisabled],
  );

  return (
    <div className="reply-md">
      <ReactMarkdown skipHtml remarkPlugins={REMARK_PLUGINS} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
