/**
 * ServiceManager
 *
 * Pure display + action handler component.
 * All polling, caching, and state ownership has moved to ServiceStatusProvider.
 * This component only reads from context and handles user toggle actions.
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ApacheService, MySQLService, PHPService } from "./index";
import type { ServiceStatus } from "@/types/services";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/routes";
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
  selectedService?: "apache" | "mysql" | "php";
  onSelectService?: (service: "apache" | "mysql" | "php") => void;
}

export function ServiceManager({
  compact = false,
  onOpenConfig,
  onViewLogs,
  onOpenPHPVersionSelector,
  currentPhpVersion = "8.3",
  selectedService,
  onSelectService,
}: ServiceManagerProps) {
  const navigate = useNavigate();

  const {
    services,
    initialLoading,
    loading,
    toggleService,
  } = useServiceStatus();

  const handleOpenConfig = (service: string) => onOpenConfig?.(service);
  const handleViewLogs = (service: string) => onViewLogs?.(service);
  const handleBackupDatabase = () => navigate(ROUTES.databasesBackups.path);
  const handleOpenTerminal = () => navigate(ROUTES.terminal.path);

  const containerClassName = compact
    ? "grid grid-cols-1 md:grid-cols-3 gap-4"
    : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";

  // Skeleton - only on very first launch with no cache
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
