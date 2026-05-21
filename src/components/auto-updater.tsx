import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { APP_VERSION } from "@/lib/version";
import { isTauri } from "@/lib/tauri";

export function AutoUpdater() {
  const { t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async (showNotification = false) => {
    if (!isTauri()) {
      console.log("[Browser Mode] Updates only available in Tauri app");
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setUpdateInfo(update);
        setUpdateAvailable(true);
        setShowDialog(true);
      } else if (showNotification) {
        // Show "up to date" notification - you can add a toast here
        console.log("App is up to date");
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setError("Failed to check for updates");
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    if (!updateInfo || !isTauri()) return;

    setDownloading(true);
    setError(null);

    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");

      await updateInfo.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            setDownloadProgress(0);
            break;
          case "Progress":
            const progress = Math.round(
              (event.data.chunkLength / event.data.contentLength) * 100,
            );
            setDownloadProgress(progress);
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });

      // Restart the app after update
      await relaunch();
    } catch (error) {
      console.error("Failed to update:", error);
      setError("Failed to download update");
      setDownloading(false);
    }
  };

  useEffect(() => {
    // Check for updates on app start (silent)
    const startupCheck = setTimeout(() => {
      checkForUpdates(false);
    }, 2000); // Delay to let app fully load

    // Check for updates every 2 hours for testing (reduce from 6 hours)
    const interval = setInterval(
      () => checkForUpdates(false),
      2 * 60 * 60 * 1000,
    );

    return () => {
      clearTimeout(startupCheck);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {/* Check Updates Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => checkForUpdates(true)}
        disabled={checking}
        className="relative"
      >
        <RefreshCw
          className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`}
        />
        {t("updater.checkUpdates")}

        {updateAvailable && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
          >
            !
          </Badge>
        )}
      </Button>

      {/* Update Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t("updater.updateAvailable")}
            </DialogTitle>
            <DialogDescription>
              {t("updater.newVersionAvailable", {
                version: updateInfo?.version,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Version Badge */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Current: v{APP_VERSION}</Badge>
              <span>→</span>
              <Badge variant="default">New: {updateInfo?.version}</Badge>
            </div>

            {/* Release Notes */}
            {updateInfo?.body && (
              <div className="max-h-32 overflow-y-auto rounded-md border p-3 text-sm bg-muted/50">
                <h4 className="font-medium mb-2">What's new:</h4>
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  {updateInfo.body}
                </pre>
              </div>
            )}

            {/* Download Progress */}
            {downloading && (
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-2">
                  <Progress value={downloadProgress} className="flex-1" />
                  <span className="text-sm font-mono min-w-[3rem]">
                    {downloadProgress}%
                  </span>
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  {downloadProgress === 100
                    ? t("updater.installAndRestart")
                    : t("updater.downloading")}
                </p>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                className="flex items-center gap-2 text-sm text-destructive"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <AlertCircle className="h-4 w-4" />
                {error}
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={downloading}
              >
                {t("updater.later")}
              </Button>
              <Button
                onClick={downloadAndInstall}
                disabled={downloading}
                className="min-w-[120px]"
              >
                {downloading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="mr-2"
                  >
                    <Download className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {downloading
                  ? t("updater.downloading")
                  : t("updater.updateNow")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
