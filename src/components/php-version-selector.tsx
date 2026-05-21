import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Download,
  Check,
  Loader2,
  RefreshCw,
  PackageCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import type { PHPVersionInfo } from "@/types/services";

// PHP 8.3 is bundled with the installer; all other branches are downloaded
// on demand. See docs/ROADMAP.md "Bundled vs downloadable".
const BUNDLED_DEFAULT_VERSION = "8.3";

// Static, user-facing context shown alongside each branch. Order matches the
// product roadmap (newest first). Backend ultimately controls which versions
// exist in `get_php_versions`.
const BRANCH_NOTES: Record<
  string,
  { description: string; features: string[] }
> = {
  "8.4": {
    description: "Latest stable release with enhanced performance",
    features: ["Property hooks", "Improved performance", "New array helpers"],
  },
  "8.3": {
    description:
      "Default bundled version - enhanced type system and performance improvements",
    features: [
      "Typed class constants",
      "Anonymous readonly classes",
      "JSON validation",
    ],
  },
  "8.2": {
    description: "Readonly classes and enums",
    features: [
      "Readonly classes",
      "Disjunctive Normal Form",
      "Random extension",
    ],
  },
  "8.1": {
    description: "Stable version with enums and fibers",
    features: ["Enums", "Fibers", "Readonly properties"],
  },
};

interface DownloadProgressPayload {
  version: string;
  stage:
    | "resolving"
    | "downloading"
    | "extracting"
    | "configuring"
    | "complete"
    | "error";
  percent: number;
  downloaded: number;
  total: number;
  message?: string | null;
}

interface PHPVersionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
  onVersionChange: (version: string) => void;
}

export function PHPVersionSelector({
  isOpen,
  onClose,
  currentVersion,
  onVersionChange,
}: PHPVersionSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [versions, setVersions] = useState<PHPVersionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<
    Record<string, DownloadProgressPayload>
  >({});

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        // Browser mode fallback - show static list with 8.2 marked installed.
        setVersions(
          ["8.4", "8.3", "8.2", "8.1"].map((v) => ({
            version: v,
            status: v === BUNDLED_DEFAULT_VERSION ? "installed" : "available",
            path: "",
            is_active: v === currentVersion,
            installed: v === BUNDLED_DEFAULT_VERSION,
            download_url: "",
          })),
        );
        return;
      }
      const result = await safeInvoke<PHPVersionInfo[]>(
        TAURI_COMMANDS.php.getVersions,
      );
      if (result) {
        // Show newest first.
        const sorted = [...result].sort((a, b) =>
          b.version.localeCompare(a.version),
        );
        setVersions(sorted);
      }
    } catch (err) {
      toast({
        title: t("php.loadFailed", "Failed to load PHP versions"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentVersion, t, toast]);

  // Load versions whenever the dialog opens.
  useEffect(() => {
    if (isOpen) {
      loadVersions();
    } else {
      // Clear stale progress when closed so a future open is clean.
      setProgress({});
    }
  }, [isOpen, loadVersions]);

  // Subscribe to backend download progress events while the dialog is open.
  useEffect(() => {
    if (!isOpen || !isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const handle = await listen<DownloadProgressPayload>(
          "php-download-progress",
          (event) => {
            setProgress((prev) => ({
              ...prev,
              [event.payload.version]: event.payload,
            }));
            if (event.payload.stage === "complete") {
              // Refresh list so the new version shows as installed.
              loadVersions();
            }
          },
        );
        if (cancelled) {
          handle();
        } else {
          unlisten = handle;
        }
      } catch (err) {
        console.error("Failed to subscribe to php-download-progress:", err);
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [isOpen, loadVersions]);

  const handleDownload = async (version: string) => {
    // Optimistic UI marker so the card shows progress immediately.
    setProgress((prev) => ({
      ...prev,
      [version]: {
        version,
        stage: "resolving",
        percent: 0,
        downloaded: 0,
        total: 0,
        message: t("php.starting", "Starting..."),
      },
    }));
    try {
      const ok = await safeInvoke<boolean>(TAURI_COMMANDS.php.downloadVersion, {
        version,
      });
      if (ok) {
        toast({
          title: t("php.downloaded", "PHP {{version}} installed", { version }),
          description: t(
            "php.downloadedHint",
            "You can now activate this version.",
          ),
        });
        loadVersions();
      }
    } catch (err) {
      setProgress((prev) => ({
        ...prev,
        [version]: {
          version,
          stage: "error",
          percent: 0,
          downloaded: 0,
          total: 0,
          message: String(err),
        },
      }));
      toast({
        title: t("php.downloadFailed", "PHP download failed"),
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const handleActivate = async (version: string) => {
    try {
      if (isTauri()) {
        const ok = await safeInvoke<boolean>(TAURI_COMMANDS.php.switchVersion, {
          version,
        });
        if (!ok) {
          throw new Error("Switch returned false");
        }
      }
      onVersionChange(version);
      toast({
        title: t("php.activated", "PHP {{version}} is now active", { version }),
      });
      onClose();
    } catch (err) {
      toast({
        title: t("php.activateFailed", "Failed to activate PHP {{version}}", {
          version,
        }),
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const isDownloadingStage = (p?: DownloadProgressPayload) =>
    !!p && p.stage !== "complete" && p.stage !== "error";

  const renderStatusBadge = (v: PHPVersionInfo) => {
    const p = progress[v.version];
    if (isDownloadingStage(p)) {
      return (
        <Badge variant="outline" className="animate-pulse">
          {t("php.stage." + p!.stage, p!.stage)}
        </Badge>
      );
    }
    if (v.is_active) {
      return (
        <Badge className="bg-green-600 hover:bg-green-700 text-white">
          {t("php.active", "Active")}
        </Badge>
      );
    }
    if (v.installed) {
      return (
        <Badge variant="secondary">
          <PackageCheck className="mr-1 h-3 w-3" />
          {t("php.installed", "Installed")}
        </Badge>
      );
    }
    return <Badge variant="outline">{t("php.available", "Available")}</Badge>;
  };

  const renderAction = (v: PHPVersionInfo) => {
    const p = progress[v.version];
    if (isDownloadingStage(p)) {
      return (
        <Button disabled size="sm">
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {t("php.stage." + p!.stage, p!.stage)}
        </Button>
      );
    }
    if (v.is_active) {
      return (
        <Button disabled size="sm" variant="secondary">
          <Check className="w-3.5 h-3.5 mr-1.5" />
          {t("php.activeVersion", "Active")}
        </Button>
      );
    }
    if (v.installed) {
      return (
        <Button size="sm" onClick={() => handleActivate(v.version)}>
          <Check className="w-3.5 h-3.5 mr-1.5" />
          {t("php.activate", "Activate")}
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleDownload(v.version)}
      >
        <Download className="w-3.5 h-3.5 mr-1.5" />
        {t("php.download", "Download")}
      </Button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("php.title", "PHP Version Manager")}
            <Badge variant="outline" className="font-mono">
              {currentVersion}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={loadVersions}
              disabled={loading}
              title={t("actions.refresh", "Refresh")}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </DialogTitle>
          <DialogDescription>
            {t(
              "php.description",
              "PHP 8.3 ships with DevStackBox. Other versions are downloaded on demand from windows.php.net and installed alongside it.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1 mt-2">
          {versions.map((v, index) => {
            const notes = BRANCH_NOTES[v.version];
            const p = progress[v.version];
            const isDownloading = isDownloadingStage(p);
            // Derive active state: trust backend flag first; fall back to
            // comparing against the currentVersion prop so that fresh installs
            // (where php/current junction does not exist yet) still correctly
            // mark the running version as active.
            const vResolved = {
              ...v,
              is_active: v.is_active || v.version === currentVersion,
            };
            return (
              <motion.div
                key={v.version}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: index * 0.04 }}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  vResolved.is_active
                    ? "border-primary bg-primary/5"
                    : "bg-card"
                }`}
              >
                {/* Left: version + description */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-sm">
                      PHP {v.version}
                    </span>
                    {v.version === BUNDLED_DEFAULT_VERSION && (
                      <Badge variant="outline" className="text-xs h-4 px-1">
                        {t("php.bundled", "Bundled")}
                      </Badge>
                    )}
                    {renderStatusBadge(vResolved)}
                  </div>
                  {notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                      {notes.description}
                    </p>
                  )}
                  {isDownloading && (
                    <div className="mt-1.5 space-y-0.5">
                      <Progress value={p?.percent ?? 0} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        {p?.message ?? t("php.stage." + p!.stage, p!.stage)}
                        {p?.total && p.total > 0 && p.stage === "downloading"
                          ? ` (${p.percent}%)`
                          : ""}
                      </p>
                    </div>
                  )}
                  {p?.stage === "error" && (
                    <p className="text-xs text-destructive mt-1">{p.message}</p>
                  )}
                </div>

                {/* Right: action button */}
                <div className="shrink-0">{renderAction(vResolved)}</div>
              </motion.div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
