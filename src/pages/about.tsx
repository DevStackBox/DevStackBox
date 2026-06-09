import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { APP_VERSION } from "@/lib/version";
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
import { BugReportDialog } from "@/components/bug-report-dialog";

interface SystemInfo {
  os: string;
  arch: string;
  os_version: string;
  app_version: string;
  tauri_version: string;
  apache_version: string | null;
  mysql_version: string | null;
  php_versions: string[];
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="break-all text-sm font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      if (!isTauri()) {
        if (!cancelled) {
          setInfo({
            os: "browser",
            arch: "n/a",
            os_version: "Browser preview",
            app_version: APP_VERSION,
            tauri_version: "n/a",
            apache_version: null,
            mysql_version: null,
            php_versions: [],
          });
          setLoading(false);
        }
        return;
      }
      const result = await safeInvoke<SystemInfo>(
        TAURI_COMMANDS.system.getSystemInfo,
      );
      if (!cancelled) {
        setInfo(result ?? null);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {t("navigation.about")}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("app.title")}</CardTitle>
          <CardDescription>{t("app.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-semibold">{t("about.version", "Version")}: {APP_VERSION}</p>
            <p className="text-sm text-muted-foreground">
              {t("about.builtWith", "Built with Tauri, React, and Rust")}
            </p>
          </div>
          <div>
            <p className="font-semibold">{t("about.author", "Author")}: Nomad Programmer</p>
            <p className="text-sm text-muted-foreground">shiv@srapsware.com</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AutoUpdater />
            <BugReportDialog />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  "https://github.com/ProgrammerNomad/DevStackBox",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              {t("about.github", "GitHub")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  "https://github.com/ProgrammerNomad/DevStackBox/wiki",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              {t("about.documentation", "Documentation")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("about.systemInfo", "System Information")}</CardTitle>
          <CardDescription>
            {t("about.systemInfoDesc", "Detected runtime, host, and bundled binary versions.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : info ? (
            <div>
              <Row label={t("about.appVersion", "App version")} value={info.app_version} />
              <Row label={t("about.tauri", "Tauri")} value={info.tauri_version} />
              <Row label={t("about.os", "OS")} value={`${info.os} (${info.arch})`} />
              <Row label={t("about.osVersion", "OS version")} value={info.os_version} />
              <Row
                label={t("about.apache", "Apache")}
                value={info.apache_version ?? t("about.notInstalled", "Not installed")}
              />
              <Row
                label={t("about.mysql", "MySQL")}
                value={info.mysql_version ?? t("about.notInstalled", "Not installed")}
              />
              <Row
                label={t("about.phpVersions", "PHP versions")}
                value={
                  info.php_versions.length > 0
                    ? info.php_versions.join(", ")
                    : t("about.noneDetected", "None detected")
                }
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
