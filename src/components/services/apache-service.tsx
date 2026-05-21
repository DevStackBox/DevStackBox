import { useTranslation } from "react-i18next";
import { Server } from "lucide-react";
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

interface ApacheServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onToggle: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  compact?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function ApacheService({
  status,
  loading,
  onToggle,
  onOpenConfig,
  onViewLogs,
  compact = false,
  isSelected = false,
  onSelect,
}: ApacheServiceProps) {
  const { t } = useTranslation();

  const openApache = () => {
    window.open("http://localhost", "_blank");
  };

  const openWWW = () => {
    window.open("http://localhost/www", "_blank");
  };

  // Primary actions stay in the card body: Start/Stop + one Open.
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
            label: t("actions.open", "Open"),
            onClick: openApache,
            variant: "outline" as const,
          },
        ]
      : []),
  ];

  const title = t("services.apache.title", "Apache HTTP Server");

  return (
    <ServiceCard
      title={title}
      description={t(
        "services.apache.description",
        "Local web server for hosting PHP applications",
      )}
      icon={Server}
      iconColor="text-orange-500"
      isRunning={status.running}
      compact={compact}
      delay={0}
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
                ],
              },
              {
                items: [
                  {
                    label: t("actions.www", "WWW"),
                    onSelect: openWWW,
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
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={openApache} disabled={!status.running}>
            {t("actions.open", "Open")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={openWWW} disabled={!status.running}>
            {t("actions.www", "WWW")}
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
