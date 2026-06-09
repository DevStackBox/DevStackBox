/**
 * UpdaterContext
 *
 * Single source of truth for all app-update state.
 *
 * Rules enforced here:
 *  - ONLY this provider may call Tauri updater APIs (check / download / install).
 *  - Polling: silent startup check after 2 s, then every 6 hours while the app is open.
 *  - `readyToInstall` is set explicitly in the "Finished" download event — never
 *    inferred from downloadProgress === 100 (fragile).
 *  - `isDismissed` is NOT stored in context state; consumers compute it locally:
 *      localStorage.getItem("devstackbox.dismissedUpdate") === updateInfo?.version
 *  - `checkError` is set on network/server failure and cleared before each new check,
 *    ensuring the About page never shows "up to date" after a failed check.
 *  - `updateAvailable` is NOT persisted to localStorage — doing so creates stale
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
import { isTauri } from "@/lib/tauri";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Minimal shape of the object returned by @tauri-apps/plugin-updater `check()`
interface UpdateInfo {
  version: string;
  body?: string;
  available: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadAndInstall: (onEvent: (event: any) => void) => Promise<void>;
}

export interface UpdaterContextValue {
  /** True once an update is confirmed available from the server */
  updateAvailable: boolean;
  /** Full update object from the Tauri updater plugin */
  updateInfo: UpdateInfo | null;
  /** True while checkForUpdates() is running */
  checking: boolean;
  /** True while downloadAndInstall() is in progress */
  downloading: boolean;
  /** 0–100 download progress */
  downloadProgress: number;
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
  /** Internal setter — consumers should use openUpdateDialog / dismissUpdate */
  setShowDialog: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  // Accumulate downloaded bytes across Progress events
  const downloadedRef = useRef(0);

  // ---------------------------------------------------------------------------
  // checkForUpdates
  // ---------------------------------------------------------------------------

  const checkForUpdates = useCallback(
    async (showNotification = false) => {
      if (!isTauri()) return;

      setChecking(true);
      setCheckError(null); // clear any previous error before each attempt

      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();

        setLastCheckedAt(new Date());

        if (update?.available) {
          setUpdateInfo(update as UpdateInfo);
          setUpdateAvailable(true);
          // Auto-open dialog on first detection (not after dismissal or re-check)
          const dismissedVersion = localStorage.getItem(
            "devstackbox.dismissedUpdate",
          );
          if (dismissedVersion !== update.version) {
            setShowDialog(true);
          }
        } else if (showNotification) {
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

  // ---------------------------------------------------------------------------
  // openUpdateDialog
  // ---------------------------------------------------------------------------

  const openUpdateDialog = useCallback(() => {
    setShowDialog(true);
  }, []);

  // ---------------------------------------------------------------------------
  // downloadAndInstall
  // ---------------------------------------------------------------------------

  const downloadAndInstall = useCallback(async () => {
    if (!updateInfo || !isTauri()) return;

    setDownloading(true);
    setCheckError(null);
    downloadedRef.current = 0;

    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateInfo.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            downloadedRef.current = 0;
            setDownloadProgress(0);
            break;

          case "Progress": {
            downloadedRef.current += event.data.chunkLength as number;
            const total = event.data.contentLength as number;
            const progress =
              total > 0
                ? Math.min(99, Math.round((downloadedRef.current / total) * 100))
                : downloadedRef.current > 0
                  ? 50
                  : 0;
            setDownloadProgress(progress);
            break;
          }

          case "Finished":
            // Set explicitly — do NOT infer from downloadProgress === 100
            setDownloadProgress(100);
            setReadyToInstall(true);
            break;
        }
      });

      await relaunch();
    } catch (err) {
      console.error("[UpdaterContext] downloadAndInstall failed:", err);
      setCheckError(t("updater.downloadFailed", "Failed to download update"));
      setDownloading(false);
    }
  }, [updateInfo, t]);

  // ---------------------------------------------------------------------------
  // dismissUpdate
  // ---------------------------------------------------------------------------

  const dismissUpdate = useCallback(() => {
    if (updateInfo?.version) {
      localStorage.setItem("devstackbox.dismissedUpdate", updateInfo.version);
    }
    setShowDialog(false);
  }, [updateInfo]);

  // ---------------------------------------------------------------------------
  // Startup check + 6-hour polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const autoCheck =
      localStorage.getItem("devstackbox.settings.autoCheckUpdates") !== "false";
    if (!autoCheck) return;

    // Silent startup check — delayed 2 s to let the app fully load
    const startupTimer = setTimeout(() => {
      void checkForUpdates(false);
    }, 2000);

    // Re-check every 6 hours while the app is open
    const pollingInterval = setInterval(
      () => void checkForUpdates(false),
      6 * 60 * 60 * 1000,
    );

    return () => {
      clearTimeout(startupTimer);
      clearInterval(pollingInterval);
    };
  }, [checkForUpdates]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <UpdaterContext.Provider
      value={{
        updateAvailable,
        updateInfo,
        checking,
        downloading,
        downloadProgress,
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdater must be used inside <UpdaterProvider>");
  }
  return ctx;
}
