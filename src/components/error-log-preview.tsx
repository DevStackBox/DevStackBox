import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { cn } from "@/lib/utils";

type LogService = "apache" | "mysql" | "php";

const MAX_LINES = 8;

function tailLines(text: string, count: number): string[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(-count);
}

function looksLikeError(line: string): boolean {
  return /\b(error|warning|fatal|critical|notice)\b/i.test(line);
}

export function ErrorLogPreview() {
  const { t } = useTranslation();
  const [service, setService] = useState<LogService>("apache");
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (svc: LogService) => {
    if (!isTauri()) {
      setLines([]);
      setMessage(
        t(
          "dashboard.errorLog.browserMode",
          "Logs are only available in the desktop app.",
        ),
      );
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const content = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service: svc },
      );
      if (!content) {
        setLines([]);
        setMessage(t("dashboard.errorLog.empty", "No log entries yet."));
      } else {
        const tail = tailLines(content, MAX_LINES);
        setLines(tail);
        if (tail.length === 0) {
          setMessage(t("dashboard.errorLog.empty", "No log entries yet."));
        }
      }
    } catch (err) {
      setLines([]);
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(service);
  }, [service, load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t("dashboard.errorLog.title", "Recent log activity")}
          </CardTitle>
          <CardDescription>
            {t(
              "dashboard.errorLog.description",
              "Last few lines from the selected service log.",
            )}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(service)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
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

        {message ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-6 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{message}</span>
          </div>
        ) : (
          <div className="max-h-48 overflow-auto rounded-md border bg-muted/30 font-mono text-xs">
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all px-3 py-1",
                  looksLikeError(line)
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground/80",
                )}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
