import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Download,
  Check,
  AlertCircle,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import type { PHPVersionInfo } from "@/types/services";

// PHP 8.2 is bundled with the installer; all other branches are downloaded
// on demand. See docs/ROADMAP.md "Bundled vs downloadable".
const BUNDLED_DEFAULT_VERSION = "8.2";

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
    description: "Enhanced type system and performance improvements",
    features: [
      "Typed class constants",
      "Anonymous readonly classes",
      "JSON validation",
    ],
  },
  "8.2": {
    description: "Default bundled version - readonly classes and enums",
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
        <Button disabled className="w-full">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {t("php.stage." + p!.stage, p!.stage)}
          {p!.total > 0 && p!.stage === "downloading" ? ` ${p!.percent}%` : ""}
        </Button>
      );
    }
    if (v.is_active) {
      return (
        <Button disabled className="w-full">
          <Check className="w-4 h-4 mr-2" />
          {t("php.activeVersion", "Active Version")}
        </Button>
      );
    }
    if (v.installed) {
      return (
        <Button className="w-full" onClick={() => handleActivate(v.version)}>
          <Check className="w-4 h-4 mr-2" />
          {t("php.activate", "Activate")}
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        className="w-full"
        onClick={() => handleDownload(v.version)}
      >
        <Download className="w-4 h-4 mr-2" />
        {t("php.downloadAndInstall", "Download & Install")}
      </Button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("php.title", "PHP Version Manager")}
            <Badge variant="outline">
              {t("php.current", "Current")}: {currentVersion}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
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
              "PHP 8.2 ships with DevStackBox. Other versions are downloaded on demand from windows.php.net and installed alongside it.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {versions.map((v, index) => {
            const notes = BRANCH_NOTES[v.version];
            const p = progress[v.version];
            return (
              <motion.div
                key={v.version}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className={v.is_active ? "ring-2 ring-primary" : ""}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        PHP {v.version}
                        {v.version === BUNDLED_DEFAULT_VERSION && (
                          <Badge variant="outline" className="text-xs">
                            {t("php.bundled", "Bundled")}
                          </Badge>
                        )}
                      </CardTitle>
                      {renderStatusBadge(v)}
                    </div>
                    {notes && (
                      <CardDescription>{notes.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {notes && (
                      <div>
                        <h4 className="font-medium mb-2 text-sm">
                          {t("php.keyFeatures", "Key features:")}
                        </h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {notes.features.map((f, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-current rounded-full" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {isDownloadingStage(p) && (
                      <div className="space-y-1">
                        <Progress value={p?.percent ?? 0} />
                        <p className="text-xs text-muted-foreground">
                          {p?.message ?? t("php.stage." + p!.stage, p!.stage)}
                        </p>
                      </div>
                    )}
                    {p?.stage === "error" && (
                      <p className="text-xs text-destructive">{p.message}</p>
                    )}

                    {renderAction(v)}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">{t("php.noteTitle", "Note:")}</p>
              <p>
                {t(
                  "php.noteBody",
                  "Downloaded PHP versions live in the php/ folder next to the bundled 8.2. Switching versions points the php/current junction at the selected branch and does not affect your projects in www/.",
                )}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
