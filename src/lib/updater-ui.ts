import type { UpdaterDownloadPhase } from "@/lib/updater-progress";

/** Show numeric download % only during byte-accurate download progress. */
export function shouldShowDownloadPercent(
  phase: UpdaterDownloadPhase | null,
  indeterminate: boolean,
  downloading: boolean,
): boolean {
  if (!downloading) return false;
  if (phase === "preparing") return false;
  if (indeterminate) return false;
  return phase === "downloading" || phase === "installing";
}

/** Pulse / indeterminate bar (no fake 0%). */
export function isUpdaterProgressIndeterminate(
  phase: UpdaterDownloadPhase | null,
  indeterminate: boolean,
): boolean {
  if (phase === "preparing") return true;
  return indeterminate;
}

export type UpdaterPrimaryButtonLabelKey =
  | "updater.restartAndUpdate"
  | "updater.retryUpdate"
  | "updater.updateNow"
  | "updater.preparingShort"
  | "updater.downloadingShort"
  | "updater.pleaseWait"
  | "updater.installingShort";

export function primaryButtonLabelKey(options: {
  downloading: boolean;
  readyToInstall: boolean;
  checkError: string | null;
  phase: UpdaterDownloadPhase | null;
  indeterminate: boolean;
  downloadRetryAttempt: number;
}): UpdaterPrimaryButtonLabelKey {
  const {
    downloading,
    readyToInstall,
    checkError,
    phase,
    indeterminate,
    downloadRetryAttempt,
  } = options;

  if (readyToInstall) return "updater.restartAndUpdate";
  if (checkError) return "updater.retryUpdate";
  if (!downloading) return "updater.updateNow";

  if (phase === "preparing") return "updater.preparingShort";
  if (phase === "installing") return "updater.installingShort";
  if (downloadRetryAttempt > 1) return "updater.pleaseWait";
  if (indeterminate || phase === "downloading") return "updater.downloadingShort";
  return "updater.pleaseWait";
}

/** Plain-text release notes for the update dialog (light markdown cleanup). */
export function formatUpdateReleaseNotes(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}
