import { memo, useEffect, useRef, type ReactNode } from "react";
import { appErrorText } from "./appErrorText";
import { errorText } from "./errorText";
import { Markdown } from "./Markdown";
import type { ToolStep, UiMessage } from "./store";

export interface MessageListProps {
  messages: UiMessage[];
  onApply?: (code: string, language: string, message: UiMessage) => void;
  renderStep?: (step: ToolStep) => ReactNode;
}

export function MessageList({
  messages,
  onApply,
  renderStep,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-neutral-500 text-sm select-none">
        Start a conversation
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          onApply={onApply}
          renderStep={renderStep}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

interface MessageItemProps {
  msg: UiMessage;
  onApply?: MessageListProps["onApply"];
  renderStep?: MessageListProps["renderStep"];
}

/**
 * One message. Memoized because a streamed chunk replaces only its own
 * message object: the others then skip parsing Markdown and highlighting
 * code again on every chunk, which made the page's memory jump during long
 * replies. Callers must pass stable `onApply` and `renderStep`.
 */
const MessageItem = memo(function MessageItem({
  msg,
  onApply,
  renderStep,
}: MessageItemProps) {
  return (
        <div
          className={`flex ${
            msg.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-neutral-800 text-neutral-100 whitespace-pre-wrap"
                : "bg-neutral-900 border border-neutral-800 text-neutral-100"
            }`}
          >
            {msg.role === "user" ? (
              <div>
                {msg.chips && msg.chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.chips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-neutral-700/80 text-neutral-300 font-mono"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                <div>{msg.text}</div>
              </div>
            ) : (
              <>
                {msg.modelName && (
                  <div className="text-[10px] text-neutral-400 font-mono mb-1 select-none">
                    {msg.modelName}
                  </div>
                )}
                {msg.parts && msg.parts.length > 0 ? (
                  msg.parts.map((part, idx) =>
                    part.kind === "text" ? (
                      <Markdown
                        key={idx}
                        text={part.text}
                        applyDisabled={msg.status === "streaming"}
                        onApply={
                          onApply
                            ? (code, language) => onApply(code, language, msg)
                            : undefined
                        }
                      />
                    ) : (
                      <div key={idx}>{renderStep?.(part.step)}</div>
                    ),
                  )
                ) : (
                  <Markdown
                    text={msg.text}
                    applyDisabled={msg.status === "streaming"}
                    onApply={
                      onApply
                        ? (code, language) => onApply(code, language, msg)
                        : undefined
                    }
                  />
                )}
                {msg.status === "streaming" && (
                  <span className="inline-block w-2 h-4 bg-neutral-400 animate-pulse ml-1 align-middle" />
                )}
                {msg.status === "stopped" && (
                  <div className="text-xs text-neutral-400 mt-2">Stopped</div>
                )}
                {msg.status === "error" && msg.commandError && (
                  <div className="text-xs text-red-400 mt-2">
                    {appErrorText(msg.commandError)}
                  </div>
                )}
                {msg.status === "error" &&
                  !msg.commandError &&
                  msg.error && (
                    <div className="text-xs text-red-400 mt-2">
                      {errorText(msg.error)}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
  );
});
