import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { safeInvoke, isTauri, getMockServiceStatus } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { motion } from "framer-motion";
import {
  ApacheService,
  MySQLService,
  PHPService,
  ServiceStatus,
} from "./index";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { notify, primeNotificationPermission } from "@/lib/notify";
import { ROUTES } from "@/lib/routes";

interface ServiceManagerProps {
  compact?: boolean;
  onServiceToggle?: (service: string, status: boolean) => void;
  onOpenConfig?: (service: string) => void;
  onViewLogs?: (service: string) => void;
  onOpenPHPVersionSelector?: () => void;
  currentPhpVersion?: string;
  onStatusesChange?: (statuses: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  }) => void;
  /**
   * Phase 6.2 - which service card is currently selected (drives the
   * Services workspace panel below the grid). When undefined the cards
   * are not selectable.
   */
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
  onStatusesChange,
  selectedService,
  onSelectService,
}: ServiceManagerProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [services, setServices] = useState({
    apache: { running: false } as ServiceStatus,
    mysql: { running: false } as ServiceStatus,
    php: { running: false } as ServiceStatus,
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  // Roadmap Phase 3.4: detect unexpected service crashes.
  // We track the previous running state per service so a transition
  // "running -> stopped" that is NOT caused by the user clicking toggle
  // surfaces as a crash notification.
  const prevRunningRef = useRef<Record<string, boolean>>({
    apache: false,
    mysql: false,
    php: false,
  });
  const loadingRef = useRef<string | null>(null);
  loadingRef.current = loading;
  // Phase 5.3 - the tray menu emits "tray-toggle-service" with the service
  // name; we need to call the latest toggleService closure from a one-shot
  // listener effect, so keep it in a ref.
  const toggleServiceRef = useRef<(service: string) => void>(() => {});

  // Check service status
  const checkServiceStatus = async (isFirstCheck = false) => {
    try {
      // On the very first check after mount, give Win32_Process a moment to
      // register processes that were just started (e.g. from onboarding dialog).
      if (isFirstCheck) {
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!isTauri()) {
        const toServiceStatus = (): ServiceStatus => {
          const mock = getMockServiceStatus();
          return {
            running: mock.running,
            pid: mock.pid ?? undefined,
            port: mock.port ?? undefined,
            version: undefined,
          };
        };

        const mockStatuses = {
          apache: toServiceStatus(),
          mysql: toServiceStatus(),
          php: toServiceStatus(),
        };
        setServices(mockStatuses);
        onStatusesChange?.(mockStatuses);
        setInitialLoading(false);
        return;
      }

      // Use allSettled so a single failing query does not blank out the rest.
      const [apacheR, mysqlR, phpR] = await Promise.allSettled([
        safeInvoke<ServiceStatus>(TAURI_COMMANDS.services.getApacheStatus),
        safeInvoke<ServiceStatus>(TAURI_COMMANDS.services.getMysqlStatus),
        safeInvoke<ServiceStatus>(TAURI_COMMANDS.services.getPhpStatus),
      ]);

      const apache = apacheR.status === "fulfilled" ? apacheR.value : null;
      const mysql  = mysqlR.status  === "fulfilled" ? mysqlR.value  : null;
      const php    = phpR.status    === "fulfilled" ? phpR.value    : null;

      // Only abort if every single query failed (network/IPC fully broken).
      if (!apache && !mysql && !php) {
        setInitialLoading(false);
        return;
      }

      const nextStatuses = {
        apache: apache ?? services.apache,
        mysql:  mysql  ?? services.mysql,
        php:    php    ?? services.php,
      };
      // Crash detection: surface a toast for any service that flipped from
      // running to stopped while NOT being toggled by the user.
      (["apache", "mysql", "php"] as const).forEach((name) => {
        const wasRunning = prevRunningRef.current[name];
        const isRunning = nextStatuses[name].running;
        if (wasRunning && !isRunning && loadingRef.current !== name) {
          const label = name.charAt(0).toUpperCase() + name.slice(1);
          toast({
            variant: "destructive",
            title: `${label} stopped unexpectedly`,
            description: `${label} was running but is no longer responding. Check logs and restart it.`,
            action: (
              <ToastAction
                altText={`Restart ${label}`}
                onClick={() => toggleServiceRef.current(name)}
              >
                Restart
              </ToastAction>
            ),
          });
          void notify(
            `${label} stopped unexpectedly`,
            "Open DevStackBox to view logs and restart the service.",
          );
          // Phase 3.4: persist crash event to crash.log with a timestamp.
          void safeInvoke(TAURI_COMMANDS.services.logCrashEvent, {
            service: name,
            timestamp: new Date().toISOString(),
          });
        }
        prevRunningRef.current[name] = isRunning;
      });
      setServices(nextStatuses);
      onStatusesChange?.(nextStatuses);
      setInitialLoading(false);
      // Tray tooltip and menu labels are now managed by the Rust poller in tray.rs.
    } catch (error) {
      console.error("Failed to check service status:", error);
      setInitialLoading(false);
    }
  };

  // Toggle service
  const toggleService = async (service: string) => {
    setLoading(service);
    try {
      if (!isTauri()) {
        toast({
          variant: "destructive",
          title: "Browser Mode",
          description: "Service control requires running in Tauri app",
        });
        setLoading(null);
        return;
      }

      let result: boolean | null;
      const serviceName = service.charAt(0).toUpperCase() + service.slice(1);

      if (service === "apache") {
        result = await safeInvoke<boolean>(
          TAURI_COMMANDS.services.toggleApache,
        );
      } else if (service === "mysql") {
        result = await safeInvoke<boolean>(TAURI_COMMANDS.services.toggleMysql);
      } else {
        result = await safeInvoke<boolean>(TAURI_COMMANDS.services.togglePhp);
      }

      if (result === null) {
        setLoading(null);
        return;
      }

      await checkServiceStatus();
      onServiceToggle?.(service, result);

      // Immediately sync tray menu labels without waiting for the 5s poller
      void safeInvoke(TAURI_COMMANDS.tray.refreshMenu);

      // Show toast notification
      toast({
        variant: "success",
        title: `${serviceName} ${result ? "Started" : "Stopped"}`,
        description: result
          ? `${serviceName} service is now running`
          : `${serviceName} service has been stopped`,
      });
      void notify(
        `${serviceName} ${result ? "started" : "stopped"}`,
        result
          ? `${serviceName} service is now running.`
          : `${serviceName} service has been stopped.`,
      );
    } catch (error) {
      console.error(`Failed to toggle ${service}:`, error);
      const errorMsg =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : String(error);
      toast({
        variant: "destructive",
        title: "Service Error",
        description: errorMsg || `Failed to start/stop ${service}.`,
      });
    } finally {
      setLoading(null);
    }
  };

  // Handle config opening
  const handleOpenConfig = (service: string) => {
    onOpenConfig?.(service);
  };

  // Handle logs viewing
  const handleViewLogs = (service: string) => {
    onViewLogs?.(service);
  };

  // Handle database backup - navigate to the Databases > Backups page (SSOT).
  const handleBackupDatabase = () => {
    navigate(ROUTES.databasesBackups.path);
  };

  // Navigate to the in-app PHP CLI terminal tab.
  const handleOpenTerminal = () => {
    navigate(ROUTES.terminalPhp.path);
  };

  useEffect(() => {
    primeNotificationPermission();
    checkServiceStatus(true);

    // Set up periodic status checking every 5 seconds for real-time monitoring
    const interval = setInterval(() => checkServiceStatus(false), 5000);

    return () => clearInterval(interval);
  }, []);

  toggleServiceRef.current = toggleService;

  // Show a one-time system notification when the window is hidden to the tray
  // via the X close button.  The notification fires while the webview is still
  // active (emitted before window.hide() in lib.rs) so the OS can display it
  // even after the window disappears.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("window-hidden-to-tray", () => {
        const SHOWN_KEY = "devstackbox.tray.hideNoticeShown";
        if (!localStorage.getItem(SHOWN_KEY)) {
          localStorage.setItem(SHOWN_KEY, "1");
          void notify(
            "DevStackBox is still running",
            "The app is minimized to the system tray. Click the tray icon to restore it.",
          );
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const containerClassName = compact
    ? "grid grid-cols-1 md:grid-cols-3 gap-4"
    : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";

  // Service Card Skeleton
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
