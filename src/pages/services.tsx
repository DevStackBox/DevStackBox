import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ServiceManager } from "@/components/services";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Activity, RefreshCw, Play, Square } from "lucide-react";
import { LogViewer } from "@/components/services";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import type { ServiceName } from "@/types/services";

interface ServicesPageProps {
  onOpenPHPVersionSelector: () => void;
  onOpenConfig: (service: ServiceName) => void;
  currentPhpVersion: string;
}

export function ServicesPage({
  onOpenPHPVersionSelector,
  onOpenConfig,
  currentPhpVersion,
}: ServicesPageProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedService, setSelectedService] = useState<
    "mysql" | "apache" | "php"
  >("mysql");
  const [logs, setLogs] = useState<string>("");
  // Phase 3.2: autoRefresh controls the 2s polling loop.
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Log viewer auto-scroll is independent from polling: users may want
  // polling on but pause scroll while they read older lines.
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<
    "start" | "stop" | "restart" | null
  >(null);
  // Roadmap Phase 3.2: poll logs every 2s while auto-refresh is enabled.
  const pollRef = useRef<number | null>(null);

  const handleServiceToggle = (service: string) => {
    // Auto-refresh logs when service changes
    if (selectedService === service) {
      refreshLogs(service);
    }
  };

  const refreshLogs = async (service: string) => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setLogs("Running in browser mode - real logs require Tauri app");
        setLoading(false);
        return;
      }

      const logContent = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        {
          service,
        },
      );
      setLogs(logContent || `No logs available for ${service}`);
    } catch (error) {
      setLogs(`Error reading logs: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Quiet poll: do not toggle the loading spinner so the textarea stays stable.
  const pollLogs = async (service: string) => {
    if (!isTauri()) return;
    try {
      const logContent = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service },
      );
      if (typeof logContent === "string") {
        setLogs(logContent);
      }
    } catch {
      // ignore transient errors during polling
    }
  };

  // Start/stop the 2-second polling loop based on autoRefresh + selectedService.
  useEffect(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!autoRefresh) return;
    // Kick off an immediate refresh so the panel is populated quickly.
    pollLogs(selectedService);
    pollRef.current = window.setInterval(() => {
      pollLogs(selectedService);
    }, 2000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedService]);

  const handleOpenConfig = (service: string) => {
    onOpenConfig(service as ServiceName);
  };

  const handleViewLogs = (service: string) => {
    setSelectedService(service as "mysql" | "apache" | "php");
    refreshLogs(service);
  };

  const clearLogs = () => {
    setLogs("");
  };

  const refreshServices = () => {
    refreshLogs(selectedService);
  };

  // Bulk service controls (Phase 3.2 polish).
  const startAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("start");
    try {
      if (!isTauri()) {
        toast({
          title: t("toast.browserOnly", "Browser mode"),
          description: t(
            "toast.requiresTauri",
            "This action requires the desktop app.",
          ),
        });
        return;
      }
      await safeInvoke(TAURI_COMMANDS.services.startMysql);
      await safeInvoke(TAURI_COMMANDS.services.startApache);
      toast({
        title: t("toast.startAllOk", "Services starting"),
        description: t(
          "toast.startAllOkDesc",
          "MySQL and Apache start commands sent.",
        ),
      });
    } catch (error) {
      toast({
        title: t("toast.startAllErr", "Start all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const stopAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("stop");
    try {
      if (!isTauri()) return;
      await safeInvoke(TAURI_COMMANDS.system.stopAllServices);
      toast({
        title: t("toast.stopAllOk", "All services stopped"),
      });
    } catch (error) {
      toast({
        title: t("toast.stopAllErr", "Stop all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const restartAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("restart");
    try {
      if (!isTauri()) return;
      await safeInvoke(TAURI_COMMANDS.system.stopAllServices);
      // Small delay to allow ports to free up before re-binding.
      await new Promise((r) => setTimeout(r, 750));
      await safeInvoke(TAURI_COMMANDS.services.startMysql);
      await safeInvoke(TAURI_COMMANDS.services.startApache);
      toast({
        title: t("toast.restartAllOk", "Services restarted"),
      });
    } catch (error) {
      toast({
        title: t("toast.restartAllErr", "Restart all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("pages.services.title", "Services")}
          </h1>
          <p className="text-muted-foreground">
            {t(
              "pages.services.description",
              "Manage your development stack services",
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <Activity className="h-3 w-3" />
            <span>{t("status.monitoring", "Monitoring")}</span>
          </Badge>
          <Button onClick={refreshServices} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("actions.refresh", "Refresh")}
          </Button>
        </div>
      </div>

      {/* Service Manager */}
      <ServiceManager
        compact={false}
        onServiceToggle={handleServiceToggle}
        onOpenConfig={handleOpenConfig}
        onViewLogs={handleViewLogs}
        onOpenPHPVersionSelector={onOpenPHPVersionSelector}
        currentPhpVersion={currentPhpVersion}
      />

      {/* Service Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>{t("services.controls.title", "Service Controls")}</span>
              </CardTitle>
              <CardDescription>
                {t(
                  "services.controls.description",
                  "Additional service management options",
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="flex items-center justify-center"
              onClick={startAllServices}
              disabled={bulkLoading !== null}
            >
              <Play className="mr-2 h-4 w-4" />
              {bulkLoading === "start"
                ? t("status.starting", "Starting...")
                : t("actions.startAll", "Start All Services")}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-center"
              onClick={stopAllServices}
              disabled={bulkLoading !== null}
            >
              <Square className="mr-2 h-4 w-4" />
              {bulkLoading === "stop"
                ? t("status.stopping", "Stopping...")
                : t("actions.stopAll", "Stop All Services")}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-center"
              onClick={restartAllServices}
              disabled={bulkLoading !== null}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {bulkLoading === "restart"
                ? t("status.restarting", "Restarting...")
                : t("actions.restartAll", "Restart All Services")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Service selection tabs above the log viewer (Phase 3.2). */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">
          {t("services.selectService", "Select Service for Logs")}
        </h3>
        <Tabs value={selectedService} onValueChange={(v) => handleViewLogs(v)}>
          <TabsList>
            <TabsTrigger value="mysql">MySQL</TabsTrigger>
            <TabsTrigger value="apache">Apache</TabsTrigger>
            <TabsTrigger value="php">PHP</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Service Logs */}
      <LogViewer
        logs={logs}
        onClear={clearLogs}
        onRefresh={() => refreshLogs(selectedService)}
        title={t("services.logs.title", "Service Logs")}
        description={t(
          "services.logs.description",
          `Real-time logs for ${selectedService.toUpperCase()}`,
        )}
        searchable
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        loading={loading}
      />

      {/* Auto-refresh polling toggle (separate from auto-scroll). */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span>
            {t("services.logs.autoRefresh", "Auto-refresh logs every 2s")}
          </span>
        </label>
      </div>
    </motion.div>
  );
}
