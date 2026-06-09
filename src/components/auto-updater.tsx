/**
 * AutoUpdater
 *
 * Renders either:
 *  - mode="indicator"  Header badge (VS Code-style).
 *    Renders nothing until an update is found.
 *    Shows a small Download icon + pulsing amber dot on update available.
 *    Click opens the update dialog.
 *
 *  - mode="button"  About page button.
 *    Always visible. Label and color reflect the full update lifecycle:
 *    Check Updates → Checking… → Update Available → Downloading 42% → Restart & Update
 *
 * All state comes from UpdaterContext — this component owns NO update logic.
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

interface AutoUpdaterProps {
  mode?: "button" | "indicator";
}

export function AutoUpdater({ mode = "button" }: AutoUpdaterProps) {
  const { t } = useTranslation();
  const {
    updateAvailable,
    updateInfo,
    checking,
    downloading,
    downloadProgress,
    readyToInstall,
    checkError,
    checkForUpdates,
    openUpdateDialog,
  } = useUpdater();

  // ------------------------------------------------------------------
  // Header indicator (mode="indicator")
  // ------------------------------------------------------------------

  if (mode === "indicator") {
    // Render nothing when no update is known
    if (!updateAvailable) return null;

    const tooltip = updateInfo?.version
      ? `DevStackBox v${updateInfo.version} ${t("updater.available", "available")} — ${t("updater.clickToUpdate", "click to update")}`
      : t("updater.updateAvailable", "Update available");

    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={openUpdateDialog}
          title={tooltip}
          className="relative text-amber-500 hover:text-amber-400"
        >
          <Download className="h-4 w-4" />
          {/* Pulsing amber dot badge */}
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
        </Button>

        {/* Shared dialog — rendered here so it works from the header too */}
        <UpdateDialog />
      </>
    );
  }

  // ------------------------------------------------------------------
  // About page button (mode="button")
  // ------------------------------------------------------------------

  const handleButtonClick = () => {
    if (readyToInstall || updateAvailable || downloading) {
      openUpdateDialog();
    } else {
      void checkForUpdates(true);
    }
  };

  // Derive button label + icon + variant from state
  let buttonLabel: string;
  let ButtonIcon: React.ElementType;
  let buttonVariant: "outline" | "default" | "secondary" = "outline";

  if (readyToInstall) {
    buttonLabel = t("updater.restartAndUpdate", "Restart & Update");
    ButtonIcon = RotateCcw;
    buttonVariant = "default";
  } else if (downloading) {
    buttonLabel = `${t("updater.downloading", "Downloading")} ${downloadProgress}%`;
    ButtonIcon = Download;
    buttonVariant = "secondary";
  } else if (updateAvailable) {
    buttonLabel = t("updater.updateAvailable", "Update Available");
    ButtonIcon = Download;
    buttonVariant = "default";
  } else if (checking) {
    buttonLabel = t("updater.checkingForUpdates", "Checking…");
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
        className={updateAvailable && !downloading ? "border-primary text-primary hover:bg-primary/10" : ""}
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

// ------------------------------------------------------------------
// Shared update dialog — used by both modes
// ------------------------------------------------------------------

function UpdateDialog() {
  const { t } = useTranslation();
  const {
    updateInfo,
    downloading,
    downloadProgress,
    readyToInstall,
    checkError,
    downloadAndInstall,
    dismissUpdate,
    showDialog,
    setShowDialog,
  } = useUpdater();

  const handleLater = () => {
    dismissUpdate(); // persists devstackbox.dismissedUpdate = version
  };

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
            {/* Current → New version line */}
            <span className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">
                {t("updater.current", "Current")}: v{APP_VERSION}
              </Badge>
              <span>→</span>
              <Badge variant="default">
                {t("updater.new", "New")}: v{updateInfo?.version}
              </Badge>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Release notes */}
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

          {/* Download progress */}
          {downloading && (
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2">
                <Progress value={downloadProgress} className="flex-1" />
                <span className="text-sm font-mono min-w-[3rem]">
                  {downloadProgress}%
                </span>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {readyToInstall
                  ? t("updater.installAndRestart", "Installing and restarting…")
                  : t("updater.downloading", "Downloading…")}
              </p>
            </motion.div>
          )}

          {/* Error */}
          {checkError && (
            <motion.p
              className="text-sm text-destructive"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {checkError}
            </motion.p>
          )}

          {/* Action buttons */}
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
              onClick={() => void downloadAndInstall()}
              disabled={downloading && !readyToInstall}
              className="min-w-[140px]"
            >
              {downloading && !readyToInstall ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-2"
                >
                  <Download className="h-4 w-4" />
                </motion.div>
              ) : readyToInstall ? (
                <RotateCcw className="h-4 w-4 mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {readyToInstall
                ? t("updater.restartAndUpdate", "Restart & Update")
                : downloading
                  ? `${t("updater.downloading", "Downloading")} ${downloadProgress}%`
                  : t("updater.updateNow", "Download & Install")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
