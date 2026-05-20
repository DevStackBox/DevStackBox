import { useTranslation } from "react-i18next";
import { Code, Download, Terminal, FileText } from "lucide-react";
import { ServiceCard } from "./service-card";
import { Badge } from "@/components/ui/badge";
import { ServiceActions, ConfigIcon, LogsIcon } from "./service-actions";
import type { ServiceStatus } from "@/types/services";

interface PHPServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onVersionSelect?: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  onOpenTerminal?: () => void;
  compact?: boolean;
  currentVersion?: string;
}

export function PHPService({
  status,
  loading,
  onVersionSelect,
  onOpenConfig,
  onViewLogs,
  onOpenTerminal,
  compact = false,
  currentVersion = "8.3",
}: PHPServiceProps) {
  const { t } = useTranslation();

  const openPhpInfo = () => {
    window.open("http://localhost/phpinfo.php", "_blank");
  };

  const openComposer = () => {
    // TODO: Implement composer interface
    console.log("Opening Composer interface...");
  };

  const actions = [
    ...(onVersionSelect
      ? [
          {
            icon: <Download className="h-4 w-4" />,
            label: t("actions.changeVersion", "Change Version"),
            onClick: onVersionSelect,
            disabled: loading,
            variant: "outline" as const,
          },
        ]
      : []),
    {
      icon: <FileText className="h-4 w-4" />,
      label: t("actions.phpinfo", "PHP Info"),
      onClick: openPhpInfo,
      variant: "outline" as const,
    },
    ...(onOpenTerminal
      ? [
          {
            icon: <Terminal className="h-4 w-4" />,
            label: t("actions.terminal", "Terminal"),
            onClick: onOpenTerminal,
            variant: "outline" as const,
          },
        ]
      : []),
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
  ];

  return (
    <ServiceCard
      title={t("services.php.title", "PHP Environment")}
      description={t(
        "services.php.description",
        "PHP runtime environment (not a service)",
      )}
      icon={Code}
      iconColor="text-purple-500"
      isRunning={true}
      compact={compact}
      delay={0.2}
      header={
        <Badge
          variant="secondary"
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          {t("status.ready", "Ready")} {currentVersion}
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* Service Information. On the dashboard (compact) the card can be
            narrow, so stack the rows to avoid label/value overlap. */}
        <div
          className={
            compact
              ? "flex flex-col gap-1 text-sm"
              : "grid grid-cols-2 gap-4 text-sm"
          }
        >
          <div className="truncate">
            <span className="text-muted-foreground">
              {t("common.version", "Version")}:
            </span>
            <span className="ml-2 font-mono">
              {status.version || currentVersion}
            </span>
          </div>
          <div className="truncate">
            <span className="text-muted-foreground">
              {t("common.status", "Status")}:
            </span>
            <span className="ml-2 text-blue-500 font-medium">
              {t("status.ready", "Ready")}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <ServiceActions
          actions={actions}
          loading={loading}
          compact={compact}
          layout="grid"
        />

        {/* Composer Integration - Always available */}
        {!compact && (
          <button
            onClick={openComposer}
            className="w-full px-4 py-2 text-sm font-medium text-left rounded-md hover:bg-accent transition-colors flex items-center gap-2"
          >
            <Code className="h-4 w-4" />
            {t("actions.composer", "Composer")}
          </button>
        )}
      </div>
    </ServiceCard>
  );
}
