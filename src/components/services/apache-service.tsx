import { useTranslation } from "react-i18next";
import { Server } from "lucide-react";
import { ServiceCard } from "./service-card";
import { StatusBadge } from "./status-badge";
import {
  ServiceActions,
  StartIcon,
  StopIcon,
  ConfigIcon,
  LogsIcon,
  OpenIcon,
} from "./service-actions";
import type { ServiceStatus } from "@/types/services";

interface ApacheServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onToggle: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  compact?: boolean;
}

export function ApacheService({
  status,
  loading,
  onToggle,
  onOpenConfig,
  onViewLogs,
  compact = false,
}: ApacheServiceProps) {
  const { t } = useTranslation();

  const openApache = () => {
    window.open("http://localhost", "_blank");
  };

  const openWWW = () => {
    window.open("http://localhost/www", "_blank");
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
    ...(status.running
      ? [
          {
            icon: OpenIcon,
            label: t("actions.open", "Open"),
            onClick: openApache,
            variant: "outline" as const,
          },
        ]
      : []),
    ...(status.running
      ? [
          {
            icon: OpenIcon,
            label: t("actions.www", "WWW"),
            onClick: openWWW,
            variant: "outline" as const,
          },
        ]
      : []),
  ];

  return (
    <ServiceCard
      title={t("services.apache.title", "Apache HTTP Server")}
      description={t(
        "services.apache.description",
        "Local web server for hosting PHP applications",
      )}
      icon={Server}
      iconColor="text-orange-500"
      isRunning={status.running}
      compact={compact}
      delay={0}
      header={<StatusBadge running={status.running} />}
    >
      <div className="space-y-4">
        {/* Service Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("common.port", "Port")}:
            </span>
            <span className="ml-2 font-mono">{status.port || 80}</span>
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
