import type { Rect, Virtualizer } from "@tanstack/react-virtual";

/**
 * react-virtual's `observeElementRect`, falling back to `initialRect` while the
 * scroll element reports no size. jsdom always reports 0, which would show no
 * rows at all in tests.
 */
export function observeRectOrInitial<TItem extends Element>(
  instance: Virtualizer<HTMLDivElement, TItem>,
  cb: (rect: Rect) => void,
) {
  const el = instance.scrollElement;
  if (!el) return;
  const fallback = instance.options.initialRect ?? { width: 0, height: 0 };
  const report = () =>
    cb({
      width: Math.round(el.clientWidth || fallback.width),
      height: Math.round(el.clientHeight || fallback.height),
    });
  report();
  if (!instance.targetWindow?.ResizeObserver) return () => {};
  const ro = new instance.targetWindow.ResizeObserver(report);
  ro.observe(el);
  return () => ro.disconnect();
}
