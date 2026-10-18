import { openLocalSite } from "@/lib/phpmyadmin";
import { useState } from "react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useServiceStatus } from "@/context/service-status-context";
import { StatusBadge } from "@/components/services/status-badge";
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
  const navigate = useNavigate();
  const [linkError, setLinkError] = useState("");
  const openSite = async (path = "/") => {
    setLinkError("");
    try {
      await openLocalSite(path);
    } catch (error) {
      setLinkError(String(error));
    }
  };
  const { services, loading, initialLoading, refresh, toggleService } =
    useServiceStatus();
  const status: ServiceStatusInfo = services.apache;
  const busy = initialLoading || loading !== null;
  const handleToggle = () => toggleService("apache");

  const running = Boolean(status?.running);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {linkError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm break-words"
        >
          {linkError}
        </p>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t("apache.status", "Status")}
                <StatusBadge running={running} state={services.apache.state} />
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
              onClick={() => void openSite()}
              disabled={!running}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("apache.openSite", "Open Local Site")}
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
              onClick={() => void openSite("/phpmyadmin/")}
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
