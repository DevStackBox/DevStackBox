import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Square, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceStatus } from "@/context/service-status-context";
import { bulkServiceActions } from "@/lib/service-actions";

/** Shared controls; the provider owns the operation lock across navigation. */
export function BulkServiceActions({ restart = false }: { restart?: boolean }) {
  const { t } = useTranslation();
  const { services, initialLoading, loading, runBulk } = useServiceStatus();
  const [busy, setBusy] = useState<"start" | "stop" | "restart" | null>(null);
  const allowed = bulkServiceActions(services, initialLoading, loading !== null || busy !== null);
  const run = async (action: "start" | "stop" | "restart") => {
    setBusy(action);
    try { await runBulk(action); } finally { setBusy(null); }
  };
  return <>
    {([
      { action: "start", enabled: allowed.canStart, icon: Play, label: t("actions.startAll", "Start All"), pending: t("status.starting", "Starting...") },
      { action: "stop", enabled: allowed.canStop, icon: Square, label: t("actions.stopAll", "Stop All"), pending: t("status.stopping", "Stopping...") },
      ...(restart ? [{ action: "restart", enabled: allowed.canRestart, icon: RefreshCw, label: t("actions.restartAll", "Restart All"), pending: t("status.restarting", "Restarting...") }] : []),
    ] as const).map(item => <Button key={item.action} size="sm" variant={item.action === "start" ? "default" : "outline"} disabled={!item.enabled} onClick={() => void run(item.action as "start" | "stop" | "restart")}>
      {busy === item.action ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <item.icon className="mr-2 h-4 w-4" />}
      {busy === item.action ? item.pending : item.label}
    </Button>)}
  </>;
}
