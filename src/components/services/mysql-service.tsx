import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ServiceCard } from "./service-card";
import { StatusBadge } from "./status-badge";
import { ServiceOverflowMenu } from "./service-overflow-menu";
import {
  ServiceActions,
  StartIcon,
  StopIcon,
  OpenIcon,
} from "./service-actions";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { ServiceStatus } from "@/types/services";

interface MySQLServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onToggle: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  onBackupDatabase?: () => void;
  compact?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function MySQLService({
  status,
  loading,
  onToggle,
  onOpenConfig,
  onViewLogs,
  onBackupDatabase,
  compact = false,
  isSelected = false,
  onSelect,
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

  // Primary actions: Start/Stop + one Open (phpMyAdmin while running).
  const primaryActions = [
    {
      icon: status.running ? StopIcon : StartIcon,
      label: loading
        ? t("common.loading", "Loading...")
        : status.running
          ? t("actions.stop", "Stop")
          : t("actions.start", "Start"),
      onClick: onToggle,
      disabled: loading,
      variant: status.running
        ? ("destructive" as "destructive" | "default")
        : ("default" as "destructive" | "default"),
    },
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
  ];

  const title = t("services.mysql.title", "MySQL");

  return (
    <ServiceCard
      title={title}
      description={t(
        "services.mysql.description",
        "Database server for storing application data",
      )}
      icon={Database}
      iconColor="text-blue-500"
      isRunning={status.running}
      compact={compact}
      delay={0.1}
      isSelected={isSelected}
      onSelect={onSelect}
      header={
        <div className="flex items-center gap-1">
          <StatusBadge running={status.running} />
          <ServiceOverflowMenu
            label={title}
            groups={[
              {
                items: [
                  ...(onOpenConfig
                    ? [
                        {
                          label: t("actions.config", "Config"),
                          onSelect: onOpenConfig,
                        },
                      ]
                    : []),
                  ...(onViewLogs
                    ? [
                        {
                          label: t("actions.logs", "Logs"),
                          onSelect: onViewLogs,
                        },
                      ]
                    : []),
                  ...(onBackupDatabase
                    ? [
                        {
                          label: t("actions.backup", "Backup"),
                          onSelect: onBackupDatabase,
                        },
                      ]
                    : []),
                ],
              },
              {
                items: [
                  {
                    label: t("actions.copy", "Copy connection"),
                    onSelect: copyConnectionString,
                    disabled: !status.running,
                  },
                ],
              },
            ]}
          />
        </div>
      }
      contextMenu={
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>{title}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onToggle} disabled={loading}>
            {status.running
              ? t("actions.stop", "Stop")
              : t("actions.start", "Start")}
          </ContextMenuItem>
          {onOpenConfig && (
            <ContextMenuItem onSelect={onOpenConfig}>
              {t("actions.config", "Config")}
            </ContextMenuItem>
          )}
          {onViewLogs && (
            <ContextMenuItem onSelect={onViewLogs}>
              {t("actions.logs", "Logs")}
            </ContextMenuItem>
          )}
          {onBackupDatabase && (
            <ContextMenuItem onSelect={onBackupDatabase}>
              {t("actions.backup", "Backup")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={openPhpMyAdmin} disabled={!status.running}>
            {t("quickActions.openPhpMyAdmin", "phpMyAdmin")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={copyConnectionString}
            disabled={!status.running}
          >
            {t("actions.copy", "Copy")}
          </ContextMenuItem>
        </ContextMenuContent>
      }
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

        {/* Primary action row */}
        <ServiceActions
          actions={primaryActions}
          loading={loading}
          compact={compact}
          layout="grid"
        />
      </div>
    </ServiceCard>
  );
}
