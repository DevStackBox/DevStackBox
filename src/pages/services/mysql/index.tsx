import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Play, Square, RefreshCw, Users, Database } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/routes";

interface ServiceStatusInfo {
  running: boolean;
  pid?: number | null;
  port?: number | null;
  uptime?: string | null;
  memory?: string | null;
  version?: string | null;
}

export function MysqlOverviewPage() {
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
        TAURI_COMMANDS.services.getMysqlStatus,
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
        ? TAURI_COMMANDS.services.stopMysql
        : TAURI_COMMANDS.services.startMysql;
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
                {t("mysql.status", "Status")}
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
                {t("mysql.description", "MySQL database server on port 3306.")}
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
              <dd className="font-mono">{status?.port ?? "3306"}</dd>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              {t("navigation.databases", "Databases")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "mysql.databasesDesc",
                "Create, browse, and back up databases.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.databases.path)}
            >
              {t("actions.open", "Open")}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {t("navigation.users", "Users")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("mysql.usersDesc", "Manage MySQL users and passwords.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.databasesUsers.path)}
            >
              {t("actions.open", "Open")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

export default MysqlOverviewPage;
