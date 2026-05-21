import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Code, FileText } from "lucide-react";
import { ServiceCard } from "./service-card";
import { Badge } from "@/components/ui/badge";
import { ServiceOverflowMenu } from "./service-overflow-menu";
import { ServiceActions } from "./service-actions";
import { PhpExtensionsDialog } from "@/components/php-extensions-dialog";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
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
  isSelected?: boolean;
  onSelect?: () => void;
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
  isSelected = false,
  onSelect,
}: PHPServiceProps) {
  const { t } = useTranslation();
  const [extensionsOpen, setExtensionsOpen] = useState(false);

  const openPhpInfo = () => {
    window.open("http://localhost/phpinfo.php", "_blank");
  };

  const openComposer = () => {
    // TODO: Implement composer interface
    console.log("Opening Composer interface...");
  };

  // Primary action for PHP: open PHP Info (PHP is not a toggleable service).
  const primaryActions = [
    {
      icon: <FileText className="h-4 w-4" />,
      label: t("actions.phpinfo", "PHP Info"),
      onClick: openPhpInfo,
      variant: "outline" as const,
    },
  ];

  const title = t("services.php.title", "PHP");

  return (
    <ServiceCard
      title={title}
      description={t(
        "services.php.description",
        "PHP runtime environment (not a service)",
      )}
      icon={Code}
      iconColor="text-purple-500"
      isRunning={true}
      compact={compact}
      delay={0.2}
      isSelected={isSelected}
      onSelect={onSelect}
      header={
        <div className="flex items-center gap-1">
          <Badge
            variant="secondary"
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            {t("status.ready", "Ready")} {currentVersion}
          </Badge>
          <ServiceOverflowMenu
            label={title}
            groups={[
              {
                items: [
                  ...(onVersionSelect
                    ? [
                        {
                          label: t("actions.changeVersion", "Change Version"),
                          onSelect: onVersionSelect,
                          disabled: loading,
                        },
                      ]
                    : []),
                  ...(onOpenTerminal
                    ? [
                        {
                          label: t("actions.terminal", "Terminal"),
                          onSelect: onOpenTerminal,
                        },
                      ]
                    : []),
                  {
                    label: t("actions.extensions", "Extensions"),
                    onSelect: () => setExtensionsOpen(true),
                  },
                  {
                    label: t("actions.composer", "Composer"),
                    onSelect: openComposer,
                  },
                ],
              },
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
            ]}
          />
        </div>
      }
      contextMenu={
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>{title}</ContextMenuLabel>
          <ContextMenuSeparator />
          {onVersionSelect && (
            <ContextMenuItem onSelect={onVersionSelect} disabled={loading}>
              {t("actions.changeVersion", "Change Version")}
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={openPhpInfo}>
            {t("actions.phpinfo", "PHP Info")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setExtensionsOpen(true)}>
            {t("actions.extensions", "Extensions")}
          </ContextMenuItem>
          {onOpenTerminal && (
            <ContextMenuItem onSelect={onOpenTerminal}>
              {t("actions.terminal", "Terminal")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
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
        </ContextMenuContent>
      }
    >
      <div className="space-y-4">
        {/* Service Information. The "Ready" status is already shown in the
            header badge, so we only display the resolved PHP version here. */}
        <div className="text-sm">
          <span className="text-muted-foreground">
            {t("common.version", "Version")}:
          </span>
          <span className="ml-2 font-mono">
            {status.version || currentVersion}
          </span>
        </div>

        {/* Primary action row */}
        <ServiceActions
          actions={primaryActions}
          loading={loading}
          compact={compact}
          layout="grid"
        />
      </div>
      <PhpExtensionsDialog
        isOpen={extensionsOpen}
        onClose={() => setExtensionsOpen(false)}
        version={currentVersion}
      />
    </ServiceCard>
  );
}
