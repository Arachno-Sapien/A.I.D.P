import { useEffect, useState } from "react";
import { FileImage, FileText, TriangleAlert, X } from "lucide-react";
import { commands } from "../../lib/bindings";
import type { MessageAttachment } from "./store";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentChipProps {
  attachment: MessageAttachment;
  /** Shown as an X button when given (the composer); sent messages have none. */
  onRemove?: () => void;
}

/** How wide a kept thumbnail is: the chip shows 32 px, twice that for sharp screens. */
const THUMB_PX = 64;
/** Small thumbnails by attachment ID, so a chip shown again reads nothing from Rust. */
const thumbs = new Map<string, string>();

/** `full` drawn at most THUMB_PX across, or null when it can't be drawn. */
async function shrink(full: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = full;
    await img.decode();
    const scale = Math.min(1, THUMB_PX / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** One attached file: an image's thumbnail, read from Rust, or a file's name and size. */
export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const [thumb, setThumb] = useState<string | null>(() => thumbs.get(attachment.id) ?? null);
  const isImage = attachment.kind === "image";

  useEffect(() => {
    if (!isImage) return;
    const kept = thumbs.get(attachment.id);
    if (kept) {
      setThumb(kept);
      return;
    }
    let cancelled = false;
    void commands.readAttachment(attachment.id).then(async (res) => {
      if (res.status !== "ok") return;
      const full = `data:${attachment.mime};base64,${res.data}`;
      // Only the small copy is kept; the full image is let go once drawn.
      const small = await shrink(full);
      if (small) thumbs.set(attachment.id, small);
      if (!cancelled) setThumb(small ?? full);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.mime, isImage]);

  const Icon = isImage ? FileImage : FileText;

  return (
    <span
      title={attachment.name}
      className="inline-flex items-center gap-1.5 max-w-56 rounded-lg border border-neutral-700/80 bg-neutral-800/80 px-1.5 py-1 text-xs text-neutral-200"
    >
      {thumb ? (
        <img
          src={thumb}
          alt={attachment.name}
          className="h-8 w-8 shrink-0 rounded object-cover"
        />
      ) : (
        <Icon size={14} aria-hidden="true" className="shrink-0 text-neutral-400" />
      )}
      <span className="min-w-0">
        <span className="block truncate">{attachment.name}</span>
        <span className="block text-[10px] text-neutral-500">
          {formatSize(attachment.size)}
        </span>
        {attachment.warning && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <TriangleAlert size={10} aria-hidden="true" />
            {attachment.warning}
          </span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          title="Remove"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
