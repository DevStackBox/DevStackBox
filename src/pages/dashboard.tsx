import { safeInvoke, isTauri } from "@/lib/tauri";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ServiceManager } from "@/components/services";
import { ErrorLogPreview } from "@/components/error-log-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TAURI_COMMANDS } from "@/lib/commands";
import { ROUTES } from "@/lib/routes";
import { Server, Globe, ArrowRight } from "lucide-react";
import { useServiceStatus } from "@/context/service-status-context";
import { useWorkspaceQuery } from "@/hooks/use-workspace-query";
import type { VhostEntry } from "@/types/vhosts";
import { BulkServiceActions } from "@/components/services/bulk-service-actions";

interface DashboardPageProps {
  onOpenPHPVersionSelector: () => void;
  /** Single source of truth: route Config clicks to the shared editor. */
  onOpenConfig: (service: "apache" | "mysql" | "php") => void;
  /** Single source of truth: route Logs clicks to the Logs page. */
  onViewLogs: (service: "apache" | "mysql" | "php") => void;
  currentPhpVersion: string;
}

export function DashboardPage({
  onOpenPHPVersionSelector,
  onOpenConfig,
  onViewLogs,
  currentPhpVersion,
}: DashboardPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { services } = useServiceStatus();
  const vhostQuery = useWorkspaceQuery('project:sites', async () => (await safeInvoke<VhostEntry[]>(TAURI_COMMANDS.vhosts.list)) ?? [], 30000, isTauri(), false);
  const vhosts = vhostQuery.data ?? [];
  const vhostsLoading = vhostQuery.data === undefined && vhostQuery.refreshing;

  const runningCount = [
    services.apache.running,
    services.mysql.running,
  ].filter(Boolean).length;
  const totalServices = 2;
  const statusLabel =
    runningCount === totalServices
      ? t("status.operational", "All services running")
      : runningCount > 0
        ? t("status.partiallyRunning", "Partially running")
        : t("status.offline", "All services stopped");
  const statusBadgeClass =
    runningCount === totalServices
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : runningCount > 0
        ? "bg-amber-500 text-black hover:bg-amber-500"
        : "bg-gray-500 hover:bg-gray-600";


  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Compact welcome + status + bulk strip */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t("pages.dashboard.title", "Dashboard")}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge className={statusBadgeClass}>{statusLabel}</Badge>
            <span>
              {runningCount}/{totalServices}{" "}
              {t("dashboard.stats.servicesActive", "services active")}
            </span>
            <span className="text-muted-foreground/70">|</span>
            <span>PHP {currentPhpVersion}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkServiceActions />
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(ROUTES.services.path)}
          >
            <Server className="mr-2 h-4 w-4" />
            {t("dashboard.actions.openServices", "Open Services")}
          </Button>
        </div>
      </div>

      {/* Compact service grid */}
      <ServiceManager
        compact
        onOpenConfig={(s) => onOpenConfig(s as "apache" | "mysql" | "php")}
        onViewLogs={(s) => onViewLogs(s as "apache" | "mysql" | "php")}
        onOpenPHPVersionSelector={onOpenPHPVersionSelector}
        currentPhpVersion={currentPhpVersion}
      />

      {/* Virtual hosts summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" />
            {t("vhosts.title", "Virtual Hosts")}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => navigate(ROUTES.apacheVhosts.path)}
          >
            {t("vhosts.manage", "Manage")}
            <ArrowRight className="w-3 h-3" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {vhostQuery.error && <div role="alert" className="mb-2 text-sm text-destructive"><p>{t("audit.vhostsFailed")}</p><Button variant="outline" size="sm" disabled={vhostQuery.refreshing} onClick={() => void vhostQuery.refresh()}>{t("actions.retry", "Retry")}</Button></div>}
          {vhostsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : vhosts.length === 0 && !vhostQuery.error ? (
            <p className="text-xs text-muted-foreground">
              {t("vhosts.noVhosts", "No virtual hosts configured yet.")}
            </p>
          ) : (
            <div className="space-y-1">
              {vhosts.slice(0, 5).map((v) => (
                <div
                  key={v.domain}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono">{v.domain}</span>
                  <Badge
                    variant={v.enabled ? "default" : "secondary"}
                    className="text-xs h-5"
                  >
                    {v.enabled ? t("vhosts.enabled", "Enabled") : t("vhosts.disabled", "Disabled")}
                  </Badge>
                </div>
              ))}
              {vhosts.length > 5 && (
                <p className="text-xs text-muted-foreground pt-1">
                  {t("vhosts.more", "+{{count}} more", { count: vhosts.length - 5 })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent log activity (capped inside the component) */}
      <ErrorLogPreview />
    </motion.div>
  );
}

export default DashboardPage;
