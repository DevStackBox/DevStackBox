import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LogViewer } from "@/components/services";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

interface WorkspaceLogViewerProps {
  service: "apache" | "mysql" | "php";
}

/**
 * Reusable log viewer panel for service workspaces — wraps LogViewer with
 * polling + refresh behavior identical to the standalone Logs page.
 */
export function WorkspaceLogViewer({ service }: WorkspaceLogViewerProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setLogs("Running in browser mode - real logs require the desktop app.");
        return;
      }
      const content = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service },
      );
      setLogs(content || `No logs available for ${service}`);
    } catch (err) {
      setLogs(`Error reading logs: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    refresh();
    if (!autoRefresh) return;
    pollRef.current = window.setInterval(async () => {
      if (!isTauri()) return;
      try {
        const content = await safeInvoke<string>(
          TAURI_COMMANDS.services.getServiceLogs,
          { service },
        );
        if (typeof content === "string") setLogs(content);
      } catch {
        // ignore transient errors
      }
    }, 2000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [autoRefresh, service, refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          {t("actions.refresh", "Refresh")}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span>{t("logs.autoRefresh", "Auto-refresh (2s)")}</span>
        </label>
      </div>
      <LogViewer
        logs={logs}
        title={t(`navigation.${service}`, service.toUpperCase())}
        loading={loading}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onRefresh={refresh}
        onClear={() => setLogs("")}
      />
    </div>
  );
}

export default WorkspaceLogViewer;
