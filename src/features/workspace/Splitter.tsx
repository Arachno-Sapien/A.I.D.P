import { useRef, type PointerEvent } from "react";

/** `width` kept between `min` and `max` and rounded; a `max` below `min` gives `min`. */
export function clampWidth(width: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(width, min), Math.max(min, max)));
}

export interface SplitterProps {
  /** Accessible name, such as "Resize file tree". */
  label: string;
  /** The current width of the panel this bar resizes. */
  width: number;
  min: number;
  /** The widest the panel may be now; asked on each move, since it depends on the window. */
  max: () => number;
  /** 1 for a panel on the left (dragging right widens it), -1 for one on the right. */
  grow: 1 | -1;
  onChange(width: number): void;
  onReset(): void;
}

const KEY_STEP = 16;

/** A vertical bar between two columns that resizes one of them by pointer or keyboard. */
export function Splitter({ label, width, min, max, grow, onChange, onReset }: SplitterProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);

  const end = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className="group w-[5px] shrink-0 flex justify-center cursor-col-resize touch-none select-none focus:outline-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start) return;
        onChange(clampWidth(start.width + grow * (e.clientX - start.x), min, max()));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        let next: number | null = null;
        if (e.key === "ArrowRight") next = width + grow * KEY_STEP;
        else if (e.key === "ArrowLeft") next = width - grow * KEY_STEP;
        else if (e.key === "Home") next = min;
        else if (e.key === "End") next = max();
        if (next === null) return;
        e.preventDefault();
        onChange(clampWidth(next, min, max()));
      }}
    >
      <div className="w-px h-full bg-neutral-800 group-hover:bg-neutral-500 group-focus-visible:bg-neutral-400" />
    </div>
  );
}
