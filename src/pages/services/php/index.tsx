import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  RefreshCw,
  Puzzle,
  FileCog,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { ROUTES } from "@/lib/routes";

interface PhpVersion {
  version: string;
  is_active: boolean;
  installed: boolean;
}

export function PhpOverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [versions, setVersions] = useState<PhpVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    if (!isTauri()) {
      setVersions([]);
      setLoading(false);
      return;
    }
    try {
      const list = await safeInvoke<PhpVersion[]>(
        TAURI_COMMANDS.php.getVersions, undefined, { fresh },
      );
      if (!list)
        throw new Error("PHP status was not returned. Refresh to retry.");
      setVersions(list);
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = versions.find((v) => v.is_active);
  const installedCount = versions.filter((v) => v.installed).length;
  const ready = Boolean(active?.installed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t("php.title", "PHP")}
                <Badge
                  variant={ready ? "default" : "secondary"}
                  className={
                    ready
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : ""
                  }
                >
                  {loading && !versions.length
                    ? t("php.checking", "Checking…")
                    : error && !versions.length
                      ? t("php.statusUnavailable", "Status unavailable")
                      : ready
                        ? t("php.statusReady", "Ready")
                        : t("php.statusNotInstalled", "Not installed")}
                </Badge>
                {active && (
                  <Badge variant="outline" className="font-mono">
                    {active.version}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  "php.description",
                  "PHP is a runtime invoked by Apache - it does not run as a background service.",
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void refresh(true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("actions.refresh", "Refresh")}
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(ROUTES.phpVersions.path)}
              >
                <SettingsIcon className="mr-2 h-4 w-4" />
                {t("php.switchVersion", "Manage versions")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">
                {t("php.activeVersion", "Default")}
              </dt>
              <dd className="font-mono">{active?.version ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("php.installedCount", "Installed branches")}
              </dt>
              <dd className="font-mono">
                {!versions.length && (loading || error) ? "-" : installedCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("php.totalVersions", "Total branches")}
              </dt>
              <dd className="font-mono">
                {!versions.length && (loading || error) ? "-" : versions.length}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Puzzle className="h-4 w-4" />
              {t("navigation.extensions", "Extensions")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "php.extensionsDesc",
                "Enable or disable PHP extensions for the default version.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.phpExtensions.path)}
            >
              {t("actions.manage", "Manage")}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCog className="h-4 w-4" />
              {t("php.iniTitle", "php.ini")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("php.iniDesc", "Edit the default PHP configuration file.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.phpConfig.path)}
            >
              {t("actions.edit", "Edit")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

export default PhpOverviewPage;
