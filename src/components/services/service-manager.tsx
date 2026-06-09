/**
 * ServiceManager
 *
 * Pure display + action handler component.
 * All polling, caching, and state ownership has moved to ServiceStatusProvider.
 * This component only reads from context and handles user toggle actions.
 */
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { motion } from "framer-motion";
import {
  ApacheService,
  MySQLService,
  PHPService,
} from "./index";
import type { ServiceStatus } from "@/types/services";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { notify } from "@/lib/notify";
import { ROUTES } from "@/lib/routes";
import { useTranslation } from "react-i18next";
import { useServiceStatus } from "@/context/service-status-context";

// Re-export ServiceStatus so importers that use the old path still work.
export type { ServiceStatus };

interface ServiceManagerProps {
  compact?: boolean;
  onServiceToggle?: (service: string, status: boolean) => void;
  onOpenConfig?: (service: string) => void;
  onViewLogs?: (service: string) => void;
  onOpenPHPVersionSelector?: () => void;
  currentPhpVersion?: string;
  /** @deprecated status is now read from ServiceStatusContext */
  onStatusesChange?: (statuses: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  }) => void;
  selectedService?: "apache" | "mysql" | "php";
  onSelectService?: (service: "apache" | "mysql" | "php") => void;
}

export function ServiceManager({
  compact = false,
  onServiceToggle,
  onOpenConfig,
  onViewLogs,
  onOpenPHPVersionSelector,
  currentPhpVersion = "8.3",
  selectedService,
  onSelectService,
}: ServiceManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    services,
    initialLoading,
    loading,
    setLoading,
    refresh,
    optimisticUpdate,
  } = useServiceStatus();

  // Keep toggleService stable reference for any external callers (tray events
  // are now handled inside ServiceStatusProvider, but kept here for safety).
  const toggleServiceRef = useRef<(service: string) => void>(() => {});

  // Toggle a service with optimistic state update
  const toggleService = async (service: string) => {
    setLoading(service);

    if (!isTauri()) {
      toast({
        variant: "destructive",
        title: t("serviceManager.browserMode", "Browser Mode"),
        description: t(
          "serviceManager.browserModeDesc",
          "Service control requires running in Tauri app",
        ),
      });
      setLoading(null);
      return;
    }

    const isCurrentlyRunning = services[service as "apache" | "mysql" | "php"].running;
    const serviceName = service.charAt(0).toUpperCase() + service.slice(1);

    // Optimistic update — show transition state immediately
    optimisticUpdate(service as "apache" | "mysql" | "php", {
      state: isCurrentlyRunning ? "stopping" : "starting",
    });

    try {
      let result: boolean | null;
      if (service === "apache") {
        result = await safeInvoke<boolean>(TAURI_COMMANDS.services.toggleApache);
      } else if (service === "mysql") {
        result = await safeInvoke<boolean>(TAURI_COMMANDS.services.toggleMysql);
      } else {
        result = await safeInvoke<boolean>(TAURI_COMMANDS.services.togglePhp);
      }

      if (result === null) {
        await refresh(); // revert optimistic state
        setLoading(null);
        return;
      }

      // Get confirmed real state
      await refresh();
      onServiceToggle?.(service, result);

      // Sync tray menu immediately
      void safeInvoke(TAURI_COMMANDS.tray.refreshMenu);

      toast({
        variant: "success",
        title: result
          ? t("serviceManager.serviceStarted", "{{service}} Started", { service: serviceName })
          : t("serviceManager.serviceStopped", "{{service}} Stopped", { service: serviceName }),
        description: result
          ? t("serviceManager.serviceNowRunning", "{{service}} service is now running", { service: serviceName })
          : t("serviceManager.serviceNowStopped", "{{service}} service has been stopped", { service: serviceName }),
      });
      void notify(
        result
          ? t("serviceManager.serviceStarted", "{{service}} Started", { service: serviceName })
          : t("serviceManager.serviceStopped", "{{service}} Stopped", { service: serviceName }),
        result
          ? t("serviceManager.serviceNowRunning", "{{service}} service is now running", { service: serviceName })
          : t("serviceManager.serviceNowStopped", "{{service}} service has been stopped", { service: serviceName }),
      );
    } catch (error) {
      console.error(`Failed to toggle ${service}:`, error);
      // RULE: on error revert to real state via refresh(), not a hardcoded error state.
      await refresh();
      const errorMsg =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : String(error);
      toast({
        variant: "destructive",
        title: t("serviceManager.serviceError", "Service Error"),
        description:
          errorMsg ||
          t("serviceManager.serviceErrorDesc", "Failed to start/stop {{service}}.", { service }),
      });
    } finally {
      setLoading(null);
    }
  };

  toggleServiceRef.current = toggleService;

  const handleOpenConfig = (service: string) => onOpenConfig?.(service);
  const handleViewLogs   = (service: string) => onViewLogs?.(service);
  const handleBackupDatabase = () => navigate(ROUTES.databasesBackups.path);
  const handleOpenTerminal   = () => navigate(ROUTES.terminal.path);

  const containerClassName = compact
    ? "grid grid-cols-1 md:grid-cols-3 gap-4"
    : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";

  // Skeleton — only on very first launch with no cache
  const ServiceSkeleton = () => (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );

  if (initialLoading) {
    return (
      <div className={containerClassName}>
        <ServiceSkeleton />
        <ServiceSkeleton />
        <ServiceSkeleton />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={containerClassName}
    >
      <ApacheService
        status={services.apache}
        loading={loading === "apache"}
        onToggle={() => toggleService("apache")}
        onOpenConfig={() => handleOpenConfig("apache")}
        onViewLogs={() => handleViewLogs("apache")}
        compact={compact}
        isSelected={selectedService === "apache"}
        onSelect={onSelectService ? () => onSelectService("apache") : undefined}
      />

      <MySQLService
        status={services.mysql}
        loading={loading === "mysql"}
        onToggle={() => toggleService("mysql")}
        onOpenConfig={() => handleOpenConfig("mysql")}
        onViewLogs={() => handleViewLogs("mysql")}
        onBackupDatabase={handleBackupDatabase}
        compact={compact}
        isSelected={selectedService === "mysql"}
        onSelect={onSelectService ? () => onSelectService("mysql") : undefined}
      />

      <PHPService
        status={services.php}
        loading={loading === "php"}
        onVersionSelect={onOpenPHPVersionSelector}
        onOpenConfig={() => handleOpenConfig("php")}
        onViewLogs={() => handleViewLogs("php")}
        onOpenTerminal={handleOpenTerminal}
        compact={compact}
        currentVersion={currentPhpVersion}
        isSelected={selectedService === "php"}
        onSelect={onSelectService ? () => onSelectService("php") : undefined}
      />
    </motion.div>
  );
}

export default ServiceManager;
