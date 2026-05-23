import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  Database,
  Globe,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInvoke, isTauri, openExternalUrl } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";

interface ServiceStatusInfo {
  running: boolean;
  pid?: number | null;
  port?: number | null;
  uptime?: string | null;
  memory?: string | null;
  version?: string | null;
}

export function ApacheOverviewPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ServiceStatusInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setStatus({ running: false });
      return;
    }
    try {
      const s = await safeInvoke<ServiceStatusInfo>(
        TAURI_COMMANDS.services.getApacheStatus,
      );
      setStatus(s ?? { running: false });
    } catch {
      setStatus({ running: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleToggle = async () => {
    setBusy(true);
    try {
      const cmd = status?.running
        ? TAURI_COMMANDS.services.stopApache
        : TAURI_COMMANDS.services.startApache;
      await safeInvoke(cmd);
      await refresh();
    } catch (err) {
      toast({
        title: t("toast.actionFailed", "Action failed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const running = Boolean(status?.running);

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
                {t("apache.status", "Status")}
                <Badge
                  variant={running ? "default" : "secondary"}
                  className={running ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {running
                    ? t("status.running", "Running")
                    : t("status.stopped", "Stopped")}
                </Badge>
              </CardTitle>
              <CardDescription>
                {t(
                  "apache.description",
                  "HTTP server serving sites from www/ on port 80.",
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={busy}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("actions.refresh", "Refresh")}
              </Button>
              <Button size="sm" onClick={handleToggle} disabled={busy}>
                {running ? (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    {t("actions.stop", "Stop")}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {t("actions.start", "Start")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">PID</dt>
              <dd className="font-mono">{status?.pid ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Port</dt>
              <dd className="font-mono">{status?.port ?? "80"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Uptime</dt>
              <dd className="font-mono">{status?.uptime ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Memory</dt>
              <dd className="font-mono">{status?.memory ?? "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              {t("apache.openSite", "Open Local Site")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("apache.openSiteDesc", "Browse the default web root.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => openExternalUrl("http://localhost")}
              disabled={!running}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              http://localhost
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              {t("apache.phpmyadmin", "phpMyAdmin")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "apache.phpmyadminDesc",
                "Web database admin (requires Apache + MySQL).",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => openExternalUrl("http://localhost/phpmyadmin")}
              disabled={!running}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("actions.open", "Open")}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" />
              {t("navigation.ssl", "SSL")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("apache.sslDesc", "Manage local HTTPS certificates.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.apacheSsl.path)}
            >
              {t("apache.manageSsl", "Manage SSL")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

export default ApacheOverviewPage;
