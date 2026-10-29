import { useState } from "react";

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = "Type a message... (Shift+Enter for newline)",
}: ComposerProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || disabled || streaming) return;
    const text = input;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-neutral-800 bg-neutral-900/40">
      <div className="max-w-4xl mx-auto flex items-end gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-2 focus-within:border-neutral-700 transition-colors">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent resize-none px-2 py-1 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none max-h-32 min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            className="bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-900 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
