import { Highlight, themes } from "prism-react-renderer";
import { type ComponentPropsWithoutRef, useState } from "react";
import ReactMarkdown from "react-markdown";

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-2 overflow-hidden rounded bg-neutral-900 text-sm">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-400">
        <span>{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer rounded px-2 py-0.5 hover:bg-neutral-800"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Highlight theme={themes.oneDark} code={code} language={language}>
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
}

export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      skipHtml
      components={{
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
            return <CodeBlock code={code} language={language} />;
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        a: ({ href, children }) => (
          <span title={href} className="underline">
            {children}
          </span>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

