import { useUpdatesStore } from "./updates";

/** The bar under the header that offers a found update; it installs only on click. */
export function UpdateBar() {
  const { found, dismissed, stage, progress, error, install, later } = useUpdatesStore();
  if (!found || dismissed) return null;

  const percent =
    progress && progress.totalKb > 0
      ? Math.min(100, Math.floor((progress.downloadedKb / progress.totalKb) * 100))
      : null;
  const status =
    stage === "installing"
      ? "Installing…"
      : stage === "downloading"
        ? percent === null
          ? "Downloading…"
          : `Downloading… ${percent}%`
        : null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-6 py-2 border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-200 select-none"
    >
      <span className="truncate">A.I.D.P {found.version} is available.</span>
      <div className="flex items-center gap-2 shrink-0">
        {error && <span className="text-red-400">{error}</span>}
        {status ? (
          <span className="text-neutral-400">{status}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void install()}
              className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-900 font-semibold hover:bg-white transition-colors cursor-pointer"
            >
              Install and restart
            </button>
            <button
              type="button"
              onClick={later}
              className="px-2.5 py-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Later
            </button>
          </>
        )}
      </div>
    </div>
  );
}
