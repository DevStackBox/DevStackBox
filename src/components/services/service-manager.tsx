import { useState, useEffect } from "react";
import { safeInvoke, isTauri, getMockServiceStatus } from "@/lib/tauri";
import { motion } from "framer-motion";
import { ApacheService, MySQLService, PHPService, ServiceStatus } from "./index";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

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
}

export function ServiceManager({
  compact = false,
  onServiceToggle,
  onOpenConfig,
  onViewLogs,
  onOpenPHPVersionSelector,
  currentPhpVersion = "8.2",
  onStatusesChange
}: ServiceManagerProps) {
  const { toast } = useToast();
  const [services, setServices] = useState({
    apache: { running: false } as ServiceStatus,
    mysql: { running: false } as ServiceStatus,
    php: { running: false } as ServiceStatus,
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Check service status
  const checkServiceStatus = async () => {
    try {
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
      
      const [apache, mysql, php] = await Promise.all([
        safeInvoke<ServiceStatus>("get_apache_status"),
        safeInvoke<ServiceStatus>("get_mysql_status"),
        safeInvoke<ServiceStatus>("get_php_status"),
      ]);
      
      if (!apache || !mysql || !php) {
        setInitialLoading(false);
        return;
      }
      
      const nextStatuses = { apache, mysql, php };
      setServices(nextStatuses);
      onStatusesChange?.(nextStatuses);
      setInitialLoading(false);
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
        result = await safeInvoke<boolean>("toggle_apache");
      } else if (service === "mysql") {
        result = await safeInvoke<boolean>("toggle_mysql");
      } else {
        result = await safeInvoke<boolean>("toggle_php");
      }
      
      if (result === null) {
        setLoading(null);
        return;
      }
      
      await checkServiceStatus();
      onServiceToggle?.(service, result);
      
      // Show toast notification
      toast({
        variant: "success",
        title: `${serviceName} ${result ? 'Started' : 'Stopped'}`,
        description: result 
          ? `${serviceName} service is now running` 
          : `${serviceName} service has been stopped`,
      });
    } catch (error) {
      console.error(`Failed to toggle ${service}:`, error);
      toast({
        variant: "destructive",
        title: "Service Error",
        description: `Failed to ${services[service as keyof typeof services].running ? 'stop' : 'start'} ${service}. Check logs for details.`,
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

  // Handle database backup
  const handleBackupDatabase = async () => {
    try {
      await safeInvoke("backup_mysql_database");
      toast({
        variant: "success",
        title: "Backup Created",
        description: "Database backup completed successfully",
      });
    } catch (error) {
      console.error("Failed to backup database:", error);
      toast({
        variant: "destructive",
        title: "Backup Failed",
        description: "Failed to create database backup",
      });
    }
  };

  // Handle PHP terminal opening
  const handleOpenTerminal = async () => {
    try {
      await safeInvoke("open_php_terminal", { version: currentPhpVersion });
      toast({
        title: "Terminal Opened",
        description: `PHP ${currentPhpVersion} terminal launched`,
      });
    } catch (error) {
      console.error("Failed to open PHP terminal:", error);
      toast({
        variant: "destructive",
        title: "Terminal Error",
        description: "Failed to open PHP terminal",
      });
    }
  };

  useEffect(() => {
    checkServiceStatus();
    
    // Set up periodic status checking every 5 seconds for real-time monitoring
    const interval = setInterval(checkServiceStatus, 5000);
    
    return () => clearInterval(interval);
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
      />

      <MySQLService
        status={services.mysql}
        loading={loading === "mysql"}
        onToggle={() => toggleService("mysql")}
        onOpenConfig={() => handleOpenConfig("mysql")}
        onViewLogs={() => handleViewLogs("mysql")}
        onBackupDatabase={handleBackupDatabase}
        compact={compact}
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
      />
    </motion.div>
  );
}

export default ServiceManager;
