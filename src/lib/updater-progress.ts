/** UI phase while downloadAndInstall runs (excludes idle). */
export type UpdaterDownloadPhase = "preparing" | "downloading" | "installing";

export interface DownloadProgressState {
  /** 0–100 when determinate; ignored when indeterminate */
  percent: number;
  /** True when total size is unknown — do not show a fake percentage */
  indeterminate: boolean;
  phase: UpdaterDownloadPhase;
}

/**
 * Maps byte counts from Tauri updater events to UI progress.
 * `contentLength` must come from the Started event, not Progress.
 */
export function computeDownloadProgress(
  downloadedBytes: number,
  contentLength: number,
): DownloadProgressState {
  if (contentLength > 0) {
    if (downloadedBytes >= contentLength) {
      return {
        percent: 99,
        indeterminate: false,
        phase: "installing",
      };
    }
    return {
      percent: Math.min(
        99,
        Math.round((downloadedBytes / contentLength) * 100),
      ),
      indeterminate: false,
      phase: "downloading",
    };
  }

  if (downloadedBytes > 0) {
    return {
      percent: 0,
      indeterminate: true,
      phase: "downloading",
    };
  }

  return {
    percent: 0,
    indeterminate: false,
    phase: "downloading",
  };
}

export const UPDATER_DOWNLOAD_MAX_RETRIES = 3;

export const UPDATER_DOWNLOAD_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

/** Heuristic: retry when the plugin or OS reports transient network failures. */
export function isTransientUpdaterError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connection") ||
    msg.includes("dns") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
