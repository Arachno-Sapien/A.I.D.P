import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { observeRectOrInitial } from "../../lib/virtual";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only the messages near the view are on the page: a rendered reply
  // (Markdown, highlighted code) holds its memory for as long as it is there.
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => messages[index]?.id ?? index,
    estimateSize: () => ESTIMATED_HEIGHT,
    // Rows are measured once rendered; jsdom reports 0, which would put
    // every row on screen.
    measureElement: (el) => el.getBoundingClientRect().height || ESTIMATED_HEIGHT,
    overscan: 4,
    gap: 16,
    paddingStart: 24,
    paddingEnd: 24,
    initialRect: { width: 600, height: 800 },
    observeElementRect: observeRectOrInitial,
  });

  // Follow the end of the conversation as messages arrive and replies grow.
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages, virtualizer]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-neutral-500 text-sm select-none">
        Start a conversation
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full px-6"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <MessageItem
              msg={messages[item.index]}
              onApply={onApply}
              renderStep={renderStep}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A first guess at a message's height; each row is measured once it renders. */
const ESTIMATED_HEIGHT = 120;

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
