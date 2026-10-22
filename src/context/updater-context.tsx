import { useServiceStatus } from "@/context/service-status-context";
/**
 * UpdaterContext
 *
 * Single source of truth for all app-update state.
 *
 * Rules enforced here:
 *  - ONLY this provider may call Tauri updater APIs (check / download / install).
 *  - Polling: silent startup check after 2 s, then every 6 hours while the app is open.
 *  - `readyToInstall` is set explicitly in the "Finished" download event - never
 *    inferred from downloadProgress === 100 (fragile).
 *  - `isDismissed` is NOT stored in context state; consumers compute it locally:
 *      localStorage.getItem("devstackbox.dismissedUpdate") === updateInfo?.version
 *  - `checkError` is set on network/server failure and cleared before each new check,
 *    ensuring the About page never shows "up to date" after a failed check.
 *  - `updateAvailable` is NOT persisted to localStorage - doing so creates stale
 *    "update available" state if the user installs manually. The 2 s startup delay
 *    is the accepted tradeoff (same as VS Code / GitHub Desktop).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APP_VERSION } from "@/lib/version";
import { isTauri, safeInvoke } from "@/lib/tauri";
import { useToast } from "@/hooks/use-toast";
import { getUpdateChannel, syncAppSettingsToBackend } from "@/lib/app-settings";
import { TAURI_COMMANDS } from "@/lib/commands";
import {
  computeDownloadProgress,
  isTransientUpdaterError,
  sleep,
  UPDATER_DOWNLOAD_MAX_RETRIES,
  UPDATER_DOWNLOAD_RETRY_DELAYS_MS,
  type UpdaterDownloadPhase,
} from "@/lib/updater-progress";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Minimal shape of the object returned by @tauri-apps/plugin-updater `check()`
interface UpdateCheckMetadata {
  rid: number;
  currentVersion: string;
  version: string;
  body?: string;
  rawJson: Record<string, unknown>;
}

interface UpdateInfo {
  version: string;
  body?: string;
  available: boolean;
  rid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadAndInstall: (onEvent: (event: any) => void) => Promise<void>;
}

export interface UpdaterContextValue {
  /** True once an update is confirmed available from the server */
  updateAvailable: boolean;
  /** Full update object from channel-aware check */
  updateInfo: UpdateInfo | null;
  /** True while checkForUpdates() is running */
  checking: boolean;
  /** True while downloadAndInstall() is in progress */
  downloading: boolean;
  /** 0–100 download progress when determinate */
  downloadProgress: number;
  /** When true, progress bar is indeterminate (unknown Content-Length) */
  downloadIndeterminate: boolean;
  /** preparing = backup/stop; downloading / installing = plugin events */
  downloadPhase: UpdaterDownloadPhase | null;
  /** 1-based retry attempt while auto-retrying transient failures */
  downloadRetryAttempt: number;
  /** No Progress events for a while - user may retry manually */
  downloadStalled: boolean;
  /** True when download + install is complete and app is ready to relaunch */
  readyToInstall: boolean;
  /** Timestamp of the last completed check (success or failure) */
  lastCheckedAt: Date | null;
  /** Non-null when the last check failed (network error, server unreachable, etc.) */
  checkError: string | null;
  /** Run an update check. Pass showNotification=true to toast "up to date". */
  checkForUpdates: (showNotification?: boolean) => Promise<void>;
  /** Open the update dialog (no re-check). Used by header badge and About button. */
  openUpdateDialog: () => void;
  /** Begin downloading and installing the available update. */
  downloadAndInstall: () => Promise<void>;
  /** Store dismissed version so dialog doesn't reopen for this release. */
  dismissUpdate: () => void;
  /** Whether the update dialog is currently open */
  showDialog: boolean;
  /** Internal setter - consumers should use openUpdateDialog / dismissUpdate */
  setShowDialog: (open: boolean) => void;
}

const STALL_MS = 90_000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const { runBulk } = useServiceStatus();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadIndeterminate, setDownloadIndeterminate] = useState(false);
  const [downloadPhase, setDownloadPhase] =
    useState<UpdaterDownloadPhase | null>(null);
  const [downloadRetryAttempt, setDownloadRetryAttempt] = useState(0);
  const [downloadStalled, setDownloadStalled] = useState(false);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const downloadedRef = useRef(0);
  const contentLengthRef = useRef(0);
  const lastProgressAtRef = useRef<number | null>(null);

  const applyProgressFromBytes = useCallback(() => {
    const state = computeDownloadProgress(
      downloadedRef.current,
      contentLengthRef.current,
    );
    setDownloadIndeterminate(state.indeterminate);
    setDownloadProgress(state.percent);
    setDownloadPhase(state.phase);
    lastProgressAtRef.current = Date.now();
    setDownloadStalled(false);
  }, []);

  // ---------------------------------------------------------------------------
  // checkForUpdates
  // ---------------------------------------------------------------------------

  const checkForUpdates = useCallback(
    async (showNotification = false) => {
      if (!isTauri()) return;

      setChecking(true);
      setCheckError(null);

      try {
        await syncAppSettingsToBackend();
        void getUpdateChannel();

        const meta = await safeInvoke<UpdateCheckMetadata | null>(
          TAURI_COMMANDS.system.checkAppUpdate,
        );

        setLastCheckedAt(new Date());

        if (meta?.version) {
          const { Channel, invoke } = await import("@tauri-apps/api/core");
          const updateInfo: UpdateInfo = {
            version: meta.version,
            body: meta.body,
            available: true,
            rid: meta.rid,
            downloadAndInstall: async (onEvent) => {
              const channel = new Channel();
              channel.onmessage = (msg) => onEvent(msg);
              await invoke("plugin:updater|download_and_install", {
                rid: meta.rid,
                onEvent: channel,
              });
            },
          };
          setUpdateInfo(updateInfo);
          setUpdateAvailable(true);
          const dismissedVersion = localStorage.getItem(
            "devstackbox.dismissedUpdate",
          );
          if (dismissedVersion !== meta.version) {
            setShowDialog(true);
          }
        } else {
          setUpdateInfo(null);
          setUpdateAvailable(false);
          setReadyToInstall(false);
          if (showNotification)
            toast({
              title: t("updater.upToDate"),
              description: `v${APP_VERSION} ${t("updater.latestVersion")}`,
            });
        }
      } catch (err) {
        console.error("[UpdaterContext] checkForUpdates failed:", err);
        setLastCheckedAt(new Date());
        setCheckError(t("updater.checkFailed", "Could not check for updates"));
      } finally {
        setChecking(false);
      }
    },
    [t, toast],
  );

  const openUpdateDialog = useCallback(() => {
    setShowDialog(true);
  }, []);

  const runPluginDownload = useCallback(
    async (info: UpdateInfo) => {
      await info.downloadAndInstall(
        (event: { event: string; data?: Record<string, unknown> }) => {
          switch (event.event) {
            case "Started":
              downloadedRef.current = 0;
              contentLengthRef.current =
                typeof event.data?.contentLength === "number"
                  ? event.data.contentLength
                  : 0;
              setDownloadPhase("downloading");
              applyProgressFromBytes();
              break;

            case "Progress": {
              const chunk = event.data?.chunkLength;
              if (typeof chunk === "number") {
                downloadedRef.current += chunk;
              }
              applyProgressFromBytes();
              break;
            }

            case "Finished":
              setDownloadProgress(100);
              setDownloadIndeterminate(false);
              setDownloadPhase("installing");
              setReadyToInstall(true);
              lastProgressAtRef.current = Date.now();
              setDownloadStalled(false);
              break;
          }
        },
      );
    },
    [applyProgressFromBytes],
  );

  const downloadAndInstall = useCallback(async () => {
    if (!updateInfo || !isTauri()) return;

    setDownloading(true);
    setCheckError(null);
    setDownloadStalled(false);
    setDownloadRetryAttempt(0);
    setReadyToInstall(false);
    downloadedRef.current = 0;
    contentLengthRef.current = 0;
    setDownloadIndeterminate(false);
    setDownloadProgress(0);
    setDownloadPhase("preparing");
    lastProgressAtRef.current = Date.now();

    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");

      await safeInvoke(TAURI_COMMANDS.backup.createFull, {
        timestamp: new Date().toISOString(),
      });
      if (!(await runBulk("stop"))) {
        throw new Error(
          "Services could not be stopped. Try the update again after stopping them.",
        );
      }

      setDownloadPhase("downloading");
      lastProgressAtRef.current = Date.now();

      let lastError: unknown;
      for (let attempt = 0; attempt < UPDATER_DOWNLOAD_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          setDownloadRetryAttempt(attempt + 1);
          const delay =
            UPDATER_DOWNLOAD_RETRY_DELAYS_MS[attempt - 1] ??
            UPDATER_DOWNLOAD_RETRY_DELAYS_MS[
              UPDATER_DOWNLOAD_RETRY_DELAYS_MS.length - 1
            ];
          await sleep(delay);
          downloadedRef.current = 0;
          contentLengthRef.current = 0;
          setDownloadProgress(0);
          setDownloadIndeterminate(false);
          setReadyToInstall(false);
          setDownloadPhase("downloading");
        }

        try {
          await runPluginDownload(updateInfo);
          await relaunch();
          return;
        } catch (err) {
          lastError = err;
          console.error(
            `[UpdaterContext] download attempt ${attempt + 1} failed:`,
            err,
          );
          const canRetry =
            attempt < UPDATER_DOWNLOAD_MAX_RETRIES - 1 &&
            isTransientUpdaterError(err);
          if (!canRetry) break;
        }
      }

      throw lastError;
    } catch (err) {
      console.error("[UpdaterContext] downloadAndInstall failed:", err);
      const message =
        err instanceof Error && err.message.includes("Services could not")
          ? err.message
          : t("updater.downloadFailed", "Failed to download update");
      setCheckError(message);
      setDownloading(false);
      setReadyToInstall(false);
      setDownloadPhase(null);
      setDownloadRetryAttempt(0);
    }
  }, [updateInfo, t, runBulk, runPluginDownload]);

  const dismissUpdate = useCallback(() => {
    if (updateInfo?.version) {
      localStorage.setItem("devstackbox.dismissedUpdate", updateInfo.version);
    }
    setShowDialog(false);
  }, [updateInfo]);

  useEffect(() => {
    if (!downloading || downloadPhase !== "downloading") {
      setDownloadStalled(false);
      return;
    }

    const interval = setInterval(() => {
      const last = lastProgressAtRef.current;
      if (last != null && Date.now() - last >= STALL_MS) {
        setDownloadStalled(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [downloading, downloadPhase]);

  useEffect(() => {
    const autoCheck =
      localStorage.getItem("devstackbox.settings.autoCheckUpdates") !== "false";
    if (!autoCheck) return;

    const startupTimer = setTimeout(() => {
      void checkForUpdates(false);
    }, 2000);

    const pollingInterval = setInterval(
      () => void checkForUpdates(false),
      6 * 60 * 60 * 1000,
    );

    return () => {
      clearTimeout(startupTimer);
      clearInterval(pollingInterval);
    };
  }, [checkForUpdates]);

  return (
    <UpdaterContext.Provider
      value={{
        updateAvailable,
        updateInfo,
        checking,
        downloading,
        downloadProgress,
        downloadIndeterminate,
        downloadPhase,
        downloadRetryAttempt,
        downloadStalled,
        readyToInstall,
        lastCheckedAt,
        checkError,
        checkForUpdates,
        openUpdateDialog,
        downloadAndInstall,
        dismissUpdate,
        showDialog,
        setShowDialog,
      }}
    >
      {children}
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdater must be used inside <UpdaterProvider>");
  }
  return ctx;
}
