import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ServiceManager } from "@/components/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  RefreshCw,
  Play,
  Square,
  Terminal,
  PackageCheck,
  Globe,
  Wrench,
} from "lucide-react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import type { ServiceName } from "@/types/services";

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

  const [bulkLoading, setBulkLoading] = useState<
    "start" | "stop" | "restart" | null
  >(null);

  const handleOpenConfig = (service: string) => {
    onOpenConfig(service as ServiceName);
  };

  const handleViewLogs = (service: string) => {
    onViewLogs(service as ServiceName);
  };

  const startAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("start");
    try {
      if (!isTauri()) {
        toast({
          title: t("toast.browserOnly", "Browser mode"),
          description: t(
            "toast.requiresTauri",
            "This action requires the desktop app.",
          ),
        });
        return;
      }
      await safeInvoke(TAURI_COMMANDS.system.startAllServices);
      toast({ title: t("toast.startAllOk", "Services starting") });
    } catch (error) {
      toast({
        title: t("toast.startAllErr", "Start all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const stopAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("stop");
    try {
      if (!isTauri()) return;
      await safeInvoke(TAURI_COMMANDS.system.stopAllServices);
      toast({ title: t("toast.stopAllOk", "All services stopped") });
    } catch (error) {
      toast({
        title: t("toast.stopAllErr", "Stop all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const restartAllServices = async () => {
    if (bulkLoading) return;
    setBulkLoading("restart");
    try {
      if (!isTauri()) return;
      await safeInvoke(TAURI_COMMANDS.system.stopAllServices);
      await new Promise((r) => setTimeout(r, 750));
      await safeInvoke(TAURI_COMMANDS.system.startAllServices);
      toast({ title: t("toast.restartAllOk", "Services restarted") });
    } catch (error) {
      toast({
        title: t("toast.restartAllErr", "Restart all failed"),
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const [toolLoading, setToolLoading] = useState<string | null>(null);

  const openPhpTerminal = async () => {
    setToolLoading("php");
    try {
      await safeInvoke(TAURI_COMMANDS.services.openPhpTerminal, {
        version: currentPhpVersion,
      });
    } catch (err) {
      toast({
        title: t("tools.phpTerminalFailed", "Failed to open PHP terminal"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setToolLoading(null);
    }
  };

  const openComposerTerminal = async () => {
    setToolLoading("composer");
    try {
      await safeInvoke(TAURI_COMMANDS.services.openComposerTerminal, {
        version: currentPhpVersion,
      });
    } catch (err) {
      toast({
        title: t(
          "tools.composerTerminalFailed",
          "Failed to open Composer terminal",
        ),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setToolLoading(null);
    }
  };

  const openPhpMyAdmin = async () => {
    setToolLoading("phpmyadmin");
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open("http://localhost/phpmyadmin");
      } else {
        window.open("http://localhost/phpmyadmin", "_blank");
      }
    } catch (err) {
      toast({
        title: t("tools.phpMyAdminFailed", "Failed to open phpMyAdmin"),
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
          <h1 className="text-2xl font-semibold tracking-tight">
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
          <Button
            size="sm"
            onClick={startAllServices}
            disabled={bulkLoading !== null}
          >
            <Play className="mr-2 h-4 w-4" />
            {bulkLoading === "start"
              ? t("status.starting", "Starting...")
              : t("actions.startAll", "Start All")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={stopAllServices}
            disabled={bulkLoading !== null}
          >
            <Square className="mr-2 h-4 w-4" />
            {bulkLoading === "stop"
              ? t("status.stopping", "Stopping...")
              : t("actions.stopAll", "Stop All")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={restartAllServices}
            disabled={bulkLoading !== null}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {bulkLoading === "restart"
              ? t("status.restarting", "Restarting...")
              : t("actions.restartAll", "Restart All")}
          </Button>
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

      {/* Developer Tools — quick-launch items that are not services */}
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
            onClick={openPhpTerminal}
            disabled={toolLoading === "php"}
          >
            <Terminal className="mr-2 h-4 w-4" />
            {t("tools.phpTerminal", "PHP Terminal")}
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              {currentPhpVersion}
            </Badge>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openComposerTerminal}
            disabled={toolLoading === "composer"}
          >
            <PackageCheck className="mr-2 h-4 w-4" />
            {t("tools.composerTerminal", "Composer Terminal")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPhpMyAdmin}
            disabled={toolLoading === "phpmyadmin"}
          >
            <Globe className="mr-2 h-4 w-4" />
            {t("tools.phpMyAdmin", "phpMyAdmin")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default ServicesPage;
