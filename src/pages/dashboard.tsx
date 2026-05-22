import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ServiceManager, type ServiceStatus } from "@/components/services";
import { ErrorLogPreview } from "@/components/error-log-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Play, Square, Server, Loader2, Globe, ArrowRight } from "lucide-react";

interface VhostEntry {
  domain: string;
  doc_root: string;
  enabled: boolean;
}

interface DashboardPageProps {
  onOpenPHPVersionSelector: () => void;
  onPageChange: (page: string) => void;
  /** Single source of truth: route Config clicks to the shared editor. */
  onOpenConfig: (service: "apache" | "mysql" | "php") => void;
  /** Single source of truth: route Logs clicks to the Logs page. */
  onViewLogs: (service: "apache" | "mysql" | "php") => void;
  currentPhpVersion: string;
}

export function DashboardPage({
  onOpenPHPVersionSelector,
  onPageChange,
  onOpenConfig,
  onViewLogs,
  currentPhpVersion,
}: DashboardPageProps) {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState<{
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"start" | "stop" | null>(null);
  const [vhosts, setVhosts] = useState<VhostEntry[]>([]);

  useEffect(() => {
    invoke<VhostEntry[]>(TAURI_COMMANDS.vhosts.list)
      .then((v) => setVhosts(v ?? []))
      .catch(() => {});
  }, []);

  const runningCount = statuses
    ? [statuses.apache.running, statuses.mysql.running].filter(Boolean).length
    : 0;
  const statusLabel =
    runningCount === 2
      ? t("status.operational", "All services running")
      : runningCount === 1
        ? t("status.partiallyRunning", "Partially running")
        : t("status.offline", "All services stopped");
  const statusBadgeClass =
    runningCount === 2
      ? "bg-green-500 hover:bg-green-600"
      : runningCount === 1
        ? "bg-orange-500 hover:bg-orange-600"
        : "bg-gray-500 hover:bg-gray-600";

  const handleStartAll = async () => {
    setBulkBusy("start");
    try {
      await invoke(TAURI_COMMANDS.system.startAllServices);
    } catch (err) {
      console.error("start_all_services failed", err);
    } finally {
      setBulkBusy(null);
    }
  };

  const handleStopAll = async () => {
    setBulkBusy("stop");
    try {
      await invoke(TAURI_COMMANDS.system.stopAllServices);
    } catch (err) {
      console.error("stop_all_services failed", err);
    } finally {
      setBulkBusy(null);
    }
  };

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
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("pages.dashboard.title", "Dashboard")}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge className={statusBadgeClass}>{statusLabel}</Badge>
            <span>
              {runningCount}/2{" "}
              {t("dashboard.stats.servicesActive", "services active")}
            </span>
            <span className="text-muted-foreground/70">|</span>
            <span>PHP {currentPhpVersion}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleStartAll}
            disabled={bulkBusy !== null}
          >
            {bulkBusy === "start" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {t("dashboard.actions.startAll", "Start All")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStopAll}
            disabled={bulkBusy !== null}
          >
            {bulkBusy === "stop" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            {t("dashboard.actions.stopAll", "Stop All")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange("services")}
          >
            <Server className="mr-2 h-4 w-4" />
            {t("dashboard.actions.openServices", "Open Services")}
          </Button>
        </div>
      </div>

      {/* Compact service grid */}
      <ServiceManager
        compact
        onServiceToggle={() => {
          /* status changes flow through onStatusesChange */
        }}
        onOpenConfig={(s) => onOpenConfig(s as "apache" | "mysql" | "php")}
        onViewLogs={(s) => onViewLogs(s as "apache" | "mysql" | "php")}
        onOpenPHPVersionSelector={onOpenPHPVersionSelector}
        currentPhpVersion={currentPhpVersion}
        onStatusesChange={setStatuses}
      />

      {/* Virtual hosts summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Virtual Hosts
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onPageChange("vhosts")}
          >
            Manage
            <ArrowRight className="w-3 h-3" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {vhosts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No virtual hosts configured.
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
                    {v.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              ))}
              {vhosts.length > 5 && (
                <p className="text-xs text-muted-foreground pt-1">
                  +{vhosts.length - 5} more
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
