import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogViewer } from "@/components/services";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

type LogService = "mysql" | "apache" | "php";

interface LogsPageProps {
  /**
   * Initial / requested service tab. When the parent changes this value
   * (e.g. the user clicks the "Logs" item on a service card), the Logs
   * page switches to that service so it remains the single source of
   * truth for log viewing.
   */
  initialService?: LogService;
}

export function LogsPage({ initialService = "apache" }: LogsPageProps) {
  const { t } = useTranslation();
  const [service, setService] = useState<LogService>(initialService);
  const [logs, setLogs] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Sync external service requests (e.g. card overflow -> Logs).
  useEffect(() => {
    setService(initialService);
  }, [initialService]);

  const refresh = async (svc: LogService) => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setLogs("Running in browser mode - real logs require the desktop app.");
        return;
      }
      const content = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service: svc },
      );
      setLogs(content || `No logs available for ${svc}`);
    } catch (err) {
      setLogs(`Error reading logs: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const poll = async (svc: LogService) => {
    if (!isTauri()) return;
    try {
      const content = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service: svc },
      );
      if (typeof content === "string") setLogs(content);
    } catch {
      // ignore transient errors
    }
  };

  useEffect(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    refresh(service);
    if (!autoRefresh) return;
    pollRef.current = window.setInterval(() => poll(service), 2000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, service]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("navigation.logs")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "pages.logs.description",
            "Real-time service log viewer with search and auto-refresh.",
          )}
        </p>
      </div>

      <div className="space-y-3">
        <Tabs
          value={service}
          onValueChange={(v) => setService(v as LogService)}
        >
          <TabsList>
            <TabsTrigger value="apache">Apache</TabsTrigger>
            <TabsTrigger value="mysql">MySQL</TabsTrigger>
            <TabsTrigger value="php">PHP</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <LogViewer
        logs={logs}
        onClear={() => setLogs("")}
        onRefresh={() => refresh(service)}
        title={t("services.logs.title", "Service Logs")}
        description={t(
          "services.logs.description",
          `Real-time logs for ${service.toUpperCase()}`,
        )}
        searchable
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        loading={loading}
      />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span>
            {t("services.logs.autoRefresh", "Auto-refresh logs every 2s")}
          </span>
        </label>
      </div>
    </motion.div>
  );
}

export default LogsPage;
