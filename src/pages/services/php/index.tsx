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
import { PHPVersionSelector } from "@/components/php-version-selector";
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
  const [selectorOpen, setSelectorOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setVersions([]);
      return;
    }
    try {
      const list = await safeInvoke<PhpVersion[]>(
        TAURI_COMMANDS.php.getVersions,
      );
      setVersions(list ?? []);
    } catch {
      setVersions([]);
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
                  className={ready ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {ready
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
                  "PHP is a runtime invoked by Apache — it does not run as a background service.",
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("actions.refresh", "Refresh")}
              </Button>
              <Button size="sm" onClick={() => setSelectorOpen(true)}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                {t("php.switchVersion", "Switch Version")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">
                {t("php.activeVersion", "Active version")}
              </dt>
              <dd className="font-mono">{active?.version ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("php.installedCount", "Installed branches")}
              </dt>
              <dd className="font-mono">{installedCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("php.totalVersions", "Total branches")}
              </dt>
              <dd className="font-mono">{versions.length}</dd>
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
                "Enable or disable PHP extensions for the active version.",
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
              {t("php.iniDesc", "Edit the active PHP configuration file.")}
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

      <PHPVersionSelector
        isOpen={selectorOpen}
        onClose={() => {
          setSelectorOpen(false);
          refresh();
        }}
        currentVersion={active?.version ?? ""}
        onVersionChange={() => refresh()}
      />
    </motion.div>
  );
}

export default PhpOverviewPage;
