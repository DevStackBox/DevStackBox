import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  const [filteredLogs, setFilteredLogs] = useState(logs);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (value.trim() === "") {
      setFilteredLogs(logs);
    } else {
      const filtered = logs
        .split("\n")
        .filter((line) => line.toLowerCase().includes(value.toLowerCase()))
        .join("\n");
      setFilteredLogs(filtered);
    }
  };

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
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("actions.search", "Search logs...")}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
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
        <Textarea
          value={filteredLogs}
          readOnly
          placeholder={t("logs.empty", "No logs yet...")}
          className="min-h-[300px] font-mono text-sm bg-muted"
        />
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
          <span className="text-xs text-muted-foreground mt-2">
            {t("logs.lineCount", "Lines")}:{" "}
            {filteredLogs.split("\n").filter((l) => l).length}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
