import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard focus for a modal dialog: it starts on `first` (the safe answer),
 * Tab stays inside `panel`, Escape calls `onCancel`, and focus goes back where
 * it was when the dialog closes.
 */
export function useModalFocus(
  panel: RefObject<HTMLElement | null>,
  first: RefObject<HTMLElement | null>,
  onCancel: () => void,
): void {
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus();

    // On the window, so keys work even if a click moved focus off the dialog.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel.current();
        return;
      }
      if (e.key !== "Tab") return;
      const buttons = Array.from(
        panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
      );
      const firstButton = buttons[0];
      const lastButton = buttons[buttons.length - 1];
      if (!firstButton || !lastButton) return;
      const active = document.activeElement;
      if (!panel.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastButton : firstButton).focus();
      } else if (e.shiftKey && active === firstButton) {
        e.preventDefault();
        lastButton.focus();
      } else if (!e.shiftKey && active === lastButton) {
        e.preventDefault();
        firstButton.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (before?.isConnected) before.focus();
    };
    // Refs are stable; the dialog sets this up once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
