import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

export interface MenuItem {
  label: string;
  /** The key that does the same from the tree, shown on the right. */
  hint?: string;
  onSelect(): void;
}

export interface TreeMenuProps {
  /** Where it opens, in window pixels; it moves in to stay on screen. */
  x: number;
  y: number;
  /** What screen readers call it, like "Actions for App.tsx". */
  label: string;
  items: MenuItem[];
  onClose(): void;
}

const KEY_NAMES: Record<string, string> = { Del: "Delete" };

/**
 * The file tree's right-click menu. Focus starts on the first item; arrow keys,
 * Home and End move; Escape closes and gives focus back to what opened it;
 * Tab, a click elsewhere or leaving the window close it.
 */
export function TreeMenu({ x, y, label, items, onClose }: TreeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close.current();
    };
    const shut = () => close.current();
    document.addEventListener("mousedown", away);
    window.addEventListener("blur", shut);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("blur", shut);
      window.removeEventListener("resize", shut);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const entries = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      entries[(i + entries.length) % entries.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(entries.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close.current();
      if (opener.current?.isConnected) opener.current.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close.current();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: x, top: y }}
      className="app-raised z-50 min-w-44 py-1 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl text-xs text-neutral-200"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-keyshortcuts={item.hint ? (KEY_NAMES[item.hint] ?? item.hint) : undefined}
          onClick={() => {
            close.current();
            item.onSelect();
          }}
          className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left cursor-pointer hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <span>{item.label}</span>
          {item.hint && (
            <span aria-hidden="true" className="text-neutral-500">
              {item.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
