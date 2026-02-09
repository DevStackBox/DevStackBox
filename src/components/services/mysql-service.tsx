import { useTranslation } from "react-i18next";
import { Database, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ServiceCard } from "./service-card";
import { StatusBadge } from "./status-badge";
import {
  ServiceActions,
  StartIcon,
  StopIcon,
  ConfigIcon,
  LogsIcon,
  OpenIcon,
  BackupIcon,
  CopyIcon,
} from "./service-actions";
import type { ServiceStatus } from "@/types/services";

interface MySQLServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onToggle: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  onBackupDatabase?: () => void;
  compact?: boolean;
}

export function MySQLService({
  status,
  loading,
  onToggle,
  onOpenConfig,
  onViewLogs,
  onBackupDatabase,
  compact = false,
}: MySQLServiceProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const openPhpMyAdmin = () => {
    window.open("http://localhost/phpmyadmin", "_blank");
  };

  const copyConnectionString = () => {
    const connectionString = `mysql://root@localhost:${status.port || 3306}`;
    navigator.clipboard.writeText(connectionString);
    toast({
      title: "Copied!",
      description: "MySQL connection string copied to clipboard",
    });
  };

  const actions = [
    {
      icon: status.running ? StopIcon : StartIcon,
      label: loading
        ? t("common.loading", "Loading...")
        : status.running
          ? t("actions.stop", "Stop")
          : t("actions.start", "Start"),
      onClick: onToggle,
      disabled: loading,
      variant: (status.running ? "destructive" : "default") as const,
    },
    ...(onOpenConfig
      ? [
          {
            icon: ConfigIcon,
            label: t("actions.config", "Config"),
            onClick: onOpenConfig,
            variant: "ghost" as const,
          },
        ]
      : []),
    ...(onViewLogs
      ? [
          {
            icon: LogsIcon,
            label: t("actions.logs", "Logs"),
            onClick: onViewLogs,
            variant: "ghost" as const,
          },
        ]
      : []),
    ...(onBackupDatabase
      ? [
          {
            icon: BackupIcon,
            label: t("actions.backup", "Backup"),
            onClick: onBackupDatabase,
            variant: "ghost" as const,
          },
        ]
      : []),
    ...(status.running
      ? [
          {
            icon: OpenIcon,
            label: t("quickActions.openPhpMyAdmin", "phpMyAdmin"),
            onClick: openPhpMyAdmin,
            variant: "outline" as const,
          },
        ]
      : []),
    ...(status.running
      ? [
          {
            icon: CopyIcon,
            label: t("actions.copy", "Copy"),
            onClick: copyConnectionString,
            variant: "outline" as const,
          },
        ]
      : []),
  ];

  return (
    <ServiceCard
      title={t("services.mysql.title", "MySQL Database")}
      description={t(
        "services.mysql.description",
        "Database server for storing application data",
      )}
      icon={Database}
      iconColor="text-blue-500"
      isRunning={status.running}
      compact={compact}
      delay={0.1}
      header={<StatusBadge running={status.running} />}
    >
      <div className="space-y-4">
        {/* Service Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("common.port", "Port")}:
            </span>
            <span className="ml-2 font-mono">{status.port || 3306}</span>
          </div>
          {status.version && (
            <div>
              <span className="text-muted-foreground">
                {t("common.version", "Version")}:
              </span>
              <span className="ml-2 font-mono">{status.version}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <ServiceActions
          actions={actions}
          loading={loading}
          compact={compact}
          layout="grid"
        />
      </div>
    </ServiceCard>
  );
}
