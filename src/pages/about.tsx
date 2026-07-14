import { useTranslation } from "react-i18next";
import { Bug, Loader2 } from "lucide-react";
import { openExternalUrl } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoUpdater } from "@/components/auto-updater";
import { useSystemInfo } from "@/hooks/use-system-info";
import { useUpdater } from "@/context/updater-context";
import { APP_VERSION } from "@/lib/version";

const GITHUB_REPO_URL = "https://github.com/ProgrammerNomad/DevStackBox";
const GITHUB_ISSUES_URL =
  "https://github.com/ProgrammerNomad/DevStackBox/issues";
const GITHUB_DOCS_URL =
  "https://github.com/ProgrammerNomad/DevStackBox/tree/main/docs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({
  label,
  value,
  refreshing = false,
}: {
  label: string;
  value: React.ReactNode;
  refreshing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 break-all text-sm font-mono text-foreground">
        {value}
        {refreshing && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </span>
    </div>
  );
}

/** Formats a Date as a relative time string: "just now", "2 minutes ago", etc. */
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Status row text derivation
// ---------------------------------------------------------------------------

function deriveStatusText(
  t: ReturnType<typeof useTranslation>["t"],
  opts: {
    checking: boolean;
    downloading: boolean;
    readyToInstall: boolean;
    updateAvailable: boolean;
    checkError: string | null;
    updateVersion?: string;
  },
): string {
  if (opts.checking)
    return t("updater.checkingForUpdates", "Checking for updates…");
  if (opts.readyToInstall)
    return t(
      "updater.statusReadyToInstall",
      "Ready to install - restart to update",
    );
  if (opts.downloading)
    return t("updater.statusDownloading", "Downloading update…");
  if (opts.updateAvailable)
    return t(
      "updater.statusUpdateAvailable",
      "Update available (v{{version}})",
      {
        version: opts.updateVersion ?? "",
      },
    );
  if (opts.checkError) return opts.checkError;
  return t("updater.upToDate", "You're running the latest version");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AboutPage() {
  const { t } = useTranslation();
  const { info, loading, hasCache, phpRefreshing } = useSystemInfo();
  const {
    checking,
    downloading,
    downloadProgress,
    readyToInstall,
    updateAvailable,
    updateInfo,
    lastCheckedAt,
    checkError,
  } = useUpdater();

  // ---- Status row text ----
  const statusText = deriveStatusText(t, {
    checking,
    downloading,
    readyToInstall,
    updateAvailable,
    checkError,
    updateVersion: updateInfo?.version,
  });

  const lastCheckedText = lastCheckedAt
    ? formatRelativeTime(lastCheckedAt)
    : t("updater.lastCheckedNever", "never");

  // ---- Determine status text color ----
  const statusColor =
    checkError || (updateAvailable && !readyToInstall && !downloading)
      ? "text-amber-500"
      : readyToInstall
        ? "text-green-500"
        : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {t("navigation.about")}
      </h1>

      {/* ── App info card ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("app.title")}</CardTitle>
          <CardDescription>{t("app.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-semibold">
              {t("about.version", "Version")}: {APP_VERSION}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("about.builtWith", "Built with Tauri, React, and Rust")}
            </p>
          </div>
          <div>
            <p className="font-semibold">
              {t("about.author", "Author")}: Nomad Programmer
            </p>
            <p className="text-sm text-muted-foreground">shiv@srapsware.com</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <AutoUpdater />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternalUrl(GITHUB_ISSUES_URL)}
            >
              <Bug className="mr-2 h-4 w-4" />
              {t("bugReport.button", "Report a bug")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternalUrl(GITHUB_REPO_URL)}
            >
              {t("about.github", "GitHub")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternalUrl(GITHUB_DOCS_URL)}
            >
              {t("about.documentation", "Documentation")}
            </Button>
          </div>

          {/* Last-checked status row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/40">
            <span>
              {t("updater.lastChecked", "Last checked")}:{" "}
              <span className="font-medium">{lastCheckedText}</span>
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>
              {t("updater.status", "Status")}:{" "}
              <span className={`font-medium ${statusColor}`}>{statusText}</span>
            </span>
            {downloading && (
              <span className="text-muted-foreground">
                ({downloadProgress}%)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── System info card ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("about.systemInfo", "System Information")}</CardTitle>
          <CardDescription>
            {t(
              "about.systemInfoDesc",
              "Detected runtime, host, and bundled binary versions.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Full skeleton only on very first launch (no cache at all) */}
          {loading && !hasCache ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : info ? (
            <div>
              <Row
                label={t("about.appVersion", "App version")}
                value={info.app_version}
              />
              <Row
                label={t("about.tauri", "Tauri")}
                value={info.tauri_version}
              />
              <Row
                label={t("about.os", "OS")}
                value={`${info.os} (${info.arch})`}
              />
              <Row
                label={t("about.osVersion", "OS version")}
                value={info.os_version}
              />
              <Row
                label={t("about.apache", "Apache")}
                value={
                  info.apache_version ??
                  t("about.notInstalled", "Not installed")
                }
              />
              <Row
                label={t("about.mysql", "MySQL")}
                value={
                  info.mysql_version ?? t("about.notInstalled", "Not installed")
                }
              />
              {/* PHP versions - only this row gets the inline spinner on refresh */}
              <Row
                label={t("about.phpVersions", "PHP versions")}
                value={
                  info.php_versions.length > 0
                    ? info.php_versions.join(", ")
                    : t("about.noneDetected", "None detected")
                }
                refreshing={phpRefreshing}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("about.loadError", "Unable to load system information.")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
