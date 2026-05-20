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
import { Settings, Activity, RefreshCw } from "lucide-react";
import { LogViewer } from "@/components/services";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
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
  const [selectedService, setSelectedService] = useState<
    "mysql" | "apache" | "php"
  >("mysql");
  const [logs, setLogs] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
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
            >
              <Activity className="mr-2 h-4 w-4" />
              {t("actions.startAll", "Start All Services")}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-center"
            >
              <Settings className="mr-2 h-4 w-4" />
              {t("actions.stopAll", "Stop All Services")}
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-center"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("actions.restartAll", "Restart All Services")}
            </Button>
          </div>
        </CardContent>
      </Card>

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
        autoScroll={autoRefresh}
        onAutoScrollChange={setAutoRefresh}
        loading={loading}
      />

      {/* Service Selection Tabs */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          {t("services.selectService", "Select Service for Logs")}
        </h3>
        <div className="flex gap-2">
          {(["mysql", "apache", "php"] as const).map((service) => (
            <button
              key={service}
              onClick={() => handleViewLogs(service)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                selectedService === service
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {service.charAt(0).toUpperCase() + service.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
