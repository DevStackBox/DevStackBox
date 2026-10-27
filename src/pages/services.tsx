import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ServiceManager } from "@/components/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Terminal,
  Wrench,
  ArrowRight,
  Server,
  Database,
  Code,
} from "lucide-react";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/routes";
import type { ServiceName } from "@/types/services";
import { BulkServiceActions } from "@/components/services/bulk-service-actions";

interface ServicesPageProps {
  onOpenPHPVersionSelector: () => void;
  onOpenConfig: (service: ServiceName) => void;
  /** Single source of truth: route Logs clicks to the Logs page. */
  onViewLogs: (service: ServiceName) => void;
  currentPhpVersion: string;
}

export function ServicesPage({
  onOpenPHPVersionSelector,
  onOpenConfig,
  onViewLogs,
  currentPhpVersion,
}: ServicesPageProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const handleOpenConfig = (service: string) => {
    onOpenConfig(service as ServiceName);
  };

  const handleViewLogs = (service: string) => {
    onViewLogs(service as ServiceName);
  };


  const [toolLoading, setToolLoading] = useState<string | null>(null);

  const openTerminal = async () => {
    setToolLoading("terminal");
    try {
      await safeInvoke(TAURI_COMMANDS.services.openPhpTerminal, {
        version: currentPhpVersion,
      });
    } catch (err) {
      toast({
        title: t("tools.terminalFailed", "Failed to open terminal"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setToolLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Page header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t("pages.services.title", "Services")}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>{t("status.monitoring", "Monitoring")}</span>
            </Badge>
            <span>
              {t(
                "pages.services.workspaceHint",
                "Select a card to inspect logs and configuration below.",
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkServiceActions restart />
        </div>
      </div>

      {/* Service grid (single source of truth for status + actions). */}
      <ServiceManager
        compact={false}
        onOpenConfig={handleOpenConfig}
        onViewLogs={handleViewLogs}
        onOpenPHPVersionSelector={onOpenPHPVersionSelector}
        currentPhpVersion={currentPhpVersion}
      />

      {/* Per-service workspaces (Open Details) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button
          variant="outline"
          className="h-auto justify-between py-3"
          onClick={() => navigate(ROUTES.apache.path)}
        >
          <span className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {t("services.openApache", "Open Apache Workspace")}
          </span>
          <ArrowRight className="h-4 w-4 opacity-60" />
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-between py-3"
          onClick={() => navigate(ROUTES.mysql.path)}
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("services.openMysql", "Open MySQL Workspace")}
          </span>
          <ArrowRight className="h-4 w-4 opacity-60" />
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-between py-3"
          onClick={() => navigate(ROUTES.php.path)}
        >
          <span className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            {t("services.openPhp", "Open PHP Workspace")}
          </span>
          <ArrowRight className="h-4 w-4 opacity-60" />
        </Button>
      </div>

      {/* Developer Tools - quick-launch items that are not services */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <hr className="flex-1 border-border" />
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            <Wrench className="h-3 w-3" />
            {t("tools.title", "Developer Tools")}
          </span>
          <hr className="flex-1 border-border" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openTerminal}
            disabled={toolLoading === "terminal"}
          >
            <Terminal className="mr-2 h-4 w-4" />
            {t("tools.terminal", "Terminal")}
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              PHP {currentPhpVersion}
            </Badge>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default ServicesPage;
