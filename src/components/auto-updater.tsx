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
import {
  formatUpdateReleaseNotes,
  isUpdaterProgressIndeterminate,
  primaryButtonLabelKey,
  shouldShowDownloadPercent,
  type UpdaterPrimaryButtonLabelKey,
} from "@/lib/updater-ui";

interface AutoUpdaterProps {
  mode?: "button" | "indicator";
}

const PRIMARY_LABEL_DEFAULTS: Record<UpdaterPrimaryButtonLabelKey, string> = {
  "updater.restartAndUpdate": "Restart & Update",
  "updater.retryUpdate": "Retry update",
  "updater.updateNow": "Download & Install",
  "updater.preparingShort": "Preparing…",
  "updater.downloadingShort": "Downloading…",
  "updater.installingShort": "Installing…",
  "updater.pleaseWait": "Please wait…",
};

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

function usePrimaryButtonLabel(): string {
  const { t } = useTranslation();
  const {
    downloading,
    downloadIndeterminate,
    downloadPhase,
    downloadRetryAttempt,
    readyToInstall,
    checkError,
  } = useUpdater();

  const key = primaryButtonLabelKey({
    downloading,
    readyToInstall,
    checkError,
    phase: downloadPhase,
    indeterminate: downloadIndeterminate,
    downloadRetryAttempt,
  });
  return t(key, PRIMARY_LABEL_DEFAULTS[key]);
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

  const primaryButtonLabel = usePrimaryButtonLabel();

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
    buttonLabel = primaryButtonLabel;
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
  const primaryButtonLabel = usePrimaryButtonLabel();

  const handleLater = () => {
    dismissUpdate();
  };

  const handlePrimaryAction = () => {
    void downloadAndInstall();
  };

  const showProgress = downloading;
  const progressIndeterminate = isUpdaterProgressIndeterminate(
    downloadPhase,
    downloadIndeterminate,
  );
  const showPercent = shouldShowDownloadPercent(
    downloadPhase,
    downloadIndeterminate,
    downloading,
  );
  const progressValue = progressIndeterminate ? undefined : downloadProgress;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="overflow-hidden max-w-[min(28rem,calc(100vw-2rem))] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <Download className="h-5 w-5 shrink-0" />
            <span className="truncate">
              DevStackBox v{updateInfo?.version}{" "}
              {t("updater.available", "available")}
            </span>
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

        <div className="min-w-0 w-full space-y-4">
          {updateInfo?.body && (
            <div className="w-full min-w-0 max-w-full max-h-40 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border p-3 text-sm bg-muted/50">
              <h4 className="font-medium mb-2">
                {t("updater.whatsNew", "What's new:")}
              </h4>
              <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">
                {formatUpdateReleaseNotes(updateInfo.body)}
              </div>
            </div>
          )}

          {showProgress && (
            <motion.div
              className="space-y-2 min-w-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Progress
                  value={progressValue}
                  className={cn(
                    "min-w-0 flex-1",
                    progressIndeterminate &&
                      "[&>div]:animate-pulse [&>div]:w-1/3 [&>div]:translate-x-0",
                  )}
                />
                {showPercent && (
                  <span className="shrink-0 text-sm font-mono min-w-[3rem] text-right">
                    {downloadProgress}%
                  </span>
                )}
              </div>
              <p className="text-sm text-center text-muted-foreground break-words [overflow-wrap:anywhere] px-1">
                {statusLabel}
              </p>
              {downloadStalled && downloadPhase === "downloading" && (
                <p className="text-sm text-center text-amber-600 dark:text-amber-500 break-words [overflow-wrap:anywhere] px-1">
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
              className="text-sm text-destructive break-words [overflow-wrap:anywhere]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {checkError}
            </motion.p>
          )}

          <div className="flex min-w-0 flex-wrap justify-end gap-2">
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
              className="max-w-full shrink"
            >
              {downloading && !readyToInstall && !checkError ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-2 shrink-0"
                >
                  <Download className="h-4 w-4" />
                </motion.div>
              ) : readyToInstall ? (
                <RotateCcw className="h-4 w-4 mr-2 shrink-0" />
              ) : checkError ? (
                <RefreshCw className="h-4 w-4 mr-2 shrink-0" />
              ) : (
                <Download className="h-4 w-4 mr-2 shrink-0" />
              )}
              <span className="truncate">{primaryButtonLabel}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
