import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Trash2, Search, Copy, Download } from "lucide-react";

interface LogViewerProps {
  logs: string;
  onClear?: () => void;
  onRefresh?: () => void;
  title?: string;
  description?: string;
  searchable?: boolean;
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  loading?: boolean;
}

// Classify a log line for terminal-style coloring. Cheap substring checks only.
function classifyLine(line: string): string {
  const lower = line.toLowerCase();
  if (
    lower.includes("[error]") ||
    lower.includes(" error ") ||
    lower.startsWith("error") ||
    lower.includes("fatal") ||
    lower.includes("critical")
  ) {
    return "text-red-400";
  }
  if (
    lower.includes("[warn]") ||
    lower.includes("warning") ||
    lower.includes(" warn ")
  ) {
    return "text-amber-300";
  }
  if (
    lower.includes("[info]") ||
    lower.includes("[notice]") ||
    lower.startsWith("info")
  ) {
    return "text-sky-300";
  }
  if (lower.includes("[debug]") || lower.includes("trace")) {
    return "text-zinc-400";
  }
  return "text-zinc-100";
}

export function LogViewer({
  logs,
  onClear,
  onRefresh,
  title,
  description,
  searchable = true,
  autoScroll = true,
  onAutoScrollChange,
  loading = false,
}: LogViewerProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLPreElement | null>(null);

  const filteredLines = useMemo(() => {
    const lines = logs.split("\n");
    const q = searchTerm.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [logs, searchTerm]);

  // Auto-scroll to the bottom whenever the visible logs grow.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLines, autoScroll]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(logs);
  };

  const downloadLogs = () => {
    const element = document.createElement("a");
    const file = new Blob([logs], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "logs.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const hasContent = filteredLines.some((l) => l.length > 0);
  const totalLines = filteredLines.filter((l) => l.length > 0).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>{title || t("services.logs.title", "Logs")}</span>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => onAutoScrollChange?.(e.target.checked)}
                className="rounded"
              />
              <span>{t("settings.autoScroll", "Auto-scroll")}</span>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {searchable && (
          <div className="sticky top-0 z-10 -mx-6 -mt-2 mb-2 flex gap-2 bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("actions.search", "Search logs...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              size="sm"
              disabled={!logs}
              title={t("actions.copy", "Copy to clipboard")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              onClick={downloadLogs}
              variant="outline"
              size="sm"
              disabled={!logs}
              title={t("actions.download", "Download logs")}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}
        <pre
          ref={scrollRef}
          className="max-h-[60vh] min-h-[400px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-950 p-3 font-mono text-xs leading-snug text-zinc-100"
        >
          {!hasContent ? (
            <span className="text-zinc-500">
              {t("logs.empty", "No logs yet...")}
            </span>
          ) : (
            filteredLines.map((line, idx) => (
              <span key={idx} className={`block ${classifyLine(line)}`}>
                {line.length === 0 ? "\u00A0" : line}
              </span>
            ))
          )}
        </pre>
        <div className="flex gap-2">
          {onRefresh && (
            <Button
              onClick={onRefresh}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              {t("actions.refresh", "Refresh")}
            </Button>
          )}
          {onClear && (
            <Button onClick={onClear} variant="outline" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              {t("actions.clear", "Clear")}
            </Button>
          )}
          <div className="flex-1" />
          <span className="mt-2 text-xs text-muted-foreground">
            {t("logs.lineCount", "Lines")}: {totalLines}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
