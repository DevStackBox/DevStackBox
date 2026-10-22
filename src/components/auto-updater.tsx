/**
 * AutoUpdater
 *
 * Renders either:
 *  - mode="indicator"  Header badge (VS Code-style).
 *  - mode="button"  About page button.
 *
 * All state comes from UpdaterContext - this component owns NO update logic.
 */

import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/context/updater-context";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

interface AutoUpdaterProps {
  mode?: "button" | "indicator";
}

function useDownloadStatusLabel(): string {
  const { t } = useTranslation();
  const {
    downloading,
    downloadProgress,
    downloadIndeterminate,
    downloadPhase,
    downloadRetryAttempt,
    readyToInstall,
  } = useUpdater();

  if (!downloading) return "";
  if (readyToInstall) {
    return t("updater.installAndRestart", "Installing and restarting...");
  }
  if (downloadPhase === "preparing") {
    return t(
      "updater.preparing",
      "Preparing update (backup and stopping services)...",
    );
  }
  if (downloadPhase === "installing") {
    return t("updater.installing", "Installing update...");
  }
  if (downloadRetryAttempt > 1) {
    return t("updater.retryingDownload", "Retrying download ({{attempt}}/{{max}})...", {
      attempt: downloadRetryAttempt,
      max: 3,
    });
  }
  if (downloadIndeterminate) {
    return t("updater.downloadingIndeterminate", "Downloading...");
  }
  return `${t("updater.downloading", "Downloading")} ${downloadProgress}%`;
}

export function AutoUpdater({ mode = "button" }: AutoUpdaterProps) {
  const { t } = useTranslation();
  const {
    updateAvailable,
    updateInfo,
    checking,
    downloading,
    readyToInstall,
    checkError,
    checkForUpdates,
    openUpdateDialog,
  } = useUpdater();

  const statusLabel = useDownloadStatusLabel();

  if (mode === "indicator") {
    if (!updateAvailable) return null;

    const tooltip = updateInfo?.version
      ? `DevStackBox v${updateInfo.version} ${t("updater.available", "available")} - ${t("updater.clickToUpdate", "click to update")}`
      : t("updater.updateAvailable", "Update available");

    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={openUpdateDialog}
          title={tooltip}
          className="relative text-primary hover:text-primary"
        >
          <Download className="h-4 w-4" />
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        </Button>
        <UpdateDialog />
      </>
    );
  }

  const handleButtonClick = () => {
    if (readyToInstall || updateAvailable || downloading || checkError) {
      openUpdateDialog();
    } else {
      void checkForUpdates(true);
    }
  };

  let buttonLabel: string;
  let ButtonIcon: React.ElementType;
  let buttonVariant: "outline" | "default" | "secondary" = "outline";

  if (readyToInstall) {
    buttonLabel = t("updater.restartAndUpdate", "Restart & Update");
    ButtonIcon = RotateCcw;
    buttonVariant = "default";
  } else if (downloading) {
    buttonLabel = statusLabel;
    ButtonIcon = Download;
    buttonVariant = "secondary";
  } else if (checkError && updateAvailable) {
    buttonLabel = t("updater.retryUpdate", "Retry update");
    ButtonIcon = RefreshCw;
    buttonVariant = "default";
  } else if (updateAvailable) {
    buttonLabel = t("updater.updateAvailable", "Update Available");
    ButtonIcon = Download;
    buttonVariant = "default";
  } else if (checking) {
    buttonLabel = t("updater.checkingForUpdates", "Checking...");
    ButtonIcon = RefreshCw;
    buttonVariant = "outline";
  } else {
    buttonLabel = t("updater.checkUpdates", "Check Updates");
    ButtonIcon = RefreshCw;
    buttonVariant = "outline";
  }

  return (
    <>
      <Button
        variant={buttonVariant}
        size="sm"
        onClick={handleButtonClick}
        disabled={checking}
        className={
          updateAvailable && !downloading
            ? "border-primary text-primary hover:bg-primary/10"
            : ""
        }
      >
        <ButtonIcon
          className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`}
        />
        {buttonLabel}
      </Button>
      <UpdateDialog />
    </>
  );
}

function UpdateDialog() {
  const { t } = useTranslation();
  const {
    updateInfo,
    downloading,
    downloadProgress,
    downloadIndeterminate,
    downloadPhase,
    downloadStalled,
    readyToInstall,
    checkError,
    downloadAndInstall,
    dismissUpdate,
    showDialog,
    setShowDialog,
  } = useUpdater();

  const statusLabel = useDownloadStatusLabel();

  const handleLater = () => {
    dismissUpdate();
  };

  const handlePrimaryAction = () => {
    void downloadAndInstall();
  };

  const showProgress = downloading;
  const progressValue = downloadIndeterminate ? undefined : downloadProgress;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            DevStackBox v{updateInfo?.version}{" "}
            {t("updater.available", "available")}
          </DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">
                {t("updater.current", "Current")}: v{APP_VERSION}
              </Badge>
              <span className="text-muted-foreground">to</span>
              <Badge variant="default">
                {t("updater.new", "New")}: v{updateInfo?.version}
              </Badge>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {updateInfo?.body && (
            <div className="max-h-32 overflow-y-auto rounded-md border p-3 text-sm bg-muted/50">
              <h4 className="font-medium mb-2">
                {t("updater.whatsNew", "What's new:")}
              </h4>
              <pre className="whitespace-pre-wrap text-muted-foreground">
                {updateInfo.body}
              </pre>
            </div>
          )}

          {showProgress && (
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2">
                <Progress
                  value={progressValue}
                  className={cn(
                    "flex-1",
                    downloadIndeterminate &&
                      "[&>div]:animate-pulse [&>div]:w-1/3 [&>div]:translate-x-0",
                  )}
                />
                {!downloadIndeterminate && (
                  <span className="text-sm font-mono min-w-[3rem]">
                    {downloadProgress}%
                  </span>
                )}
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {statusLabel}
              </p>
              {downloadStalled && downloadPhase === "downloading" && (
                <p className="text-sm text-center text-amber-600 dark:text-amber-500">
                  {t(
                    "updater.downloadStalled",
                    "Download is taking longer than expected. You can wait or use Retry after it fails.",
                  )}
                </p>
              )}
            </motion.div>
          )}

          {checkError && (
            <motion.p
              className="text-sm text-destructive"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {checkError}
            </motion.p>
          )}

          <div className="flex gap-2 justify-end">
            {!readyToInstall && (
              <Button
                variant="outline"
                onClick={handleLater}
                disabled={downloading}
              >
                {t("updater.later", "Later")}
              </Button>
            )}
            <Button
              onClick={handlePrimaryAction}
              disabled={downloading && !readyToInstall && !checkError}
              className="min-w-[140px]"
            >
              {downloading && !readyToInstall && !checkError ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-2"
                >
                  <Download className="h-4 w-4" />
                </motion.div>
              ) : readyToInstall ? (
                <RotateCcw className="h-4 w-4 mr-2" />
              ) : checkError ? (
                <RefreshCw className="h-4 w-4 mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {readyToInstall
                ? t("updater.restartAndUpdate", "Restart & Update")
                : downloading && !checkError
                  ? statusLabel
                  : checkError
                    ? t("updater.retryUpdate", "Retry update")
                    : t("updater.updateNow", "Download & Install")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
