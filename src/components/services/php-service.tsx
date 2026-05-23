import { useTranslation } from "react-i18next";
import { Code, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { openExternalUrl } from "@/lib/tauri";
import { ServiceCard } from "./service-card";
import { Badge } from "@/components/ui/badge";
import { ServiceOverflowMenu } from "./service-overflow-menu";
import { ServiceActions } from "./service-actions";
import { ROUTES } from "@/lib/routes";
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
  const navigate = useNavigate();

  const openPhpInfo = () => {
    openExternalUrl("http://localhost/phpinfo.php");
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
      logoSrc="/php.svg"
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
                  {
                    label: t("actions.workspace", "Workspace"),
                    onSelect: () => navigate(ROUTES.php.path),
                  },
                ],
              },
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
                    onSelect: () => navigate(ROUTES.phpExtensions.path),
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
                          label: (
                            <span className="flex w-full items-center justify-between gap-4">
                              <span>{t("actions.config", "Config")}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                php.ini
                              </span>
                            </span>
                          ),
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
          <ContextMenuSeparator />{" "}
          <ContextMenuItem onSelect={() => navigate(ROUTES.php.path)}>
            {t("actions.workspace", "Workspace")}
          </ContextMenuItem>
          <ContextMenuSeparator />{" "}
          {onVersionSelect && (
            <ContextMenuItem onSelect={onVersionSelect} disabled={loading}>
              {t("actions.changeVersion", "Change Version")}
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={openPhpInfo}>
            {t("actions.phpinfo", "PHP Info")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => navigate(ROUTES.phpExtensions.path)}>
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
              <span className="flex w-full items-center justify-between gap-4">
                <span>{t("actions.config", "Config")}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  php.ini
                </span>
              </span>
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
    </ServiceCard>
  );
}
