import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import {
  Database as DatabaseIcon,
  Download,
  Upload,
  RefreshCw,
  ExternalLink,
  Search,
  Copy,
} from "lucide-react";

interface DatabaseInfo {
  name: string;
  tableCount: number;
  sizeBytes: number;
}

// Tauri returns snake_case fields (serde::Serialize on the Rust struct).
interface RawDatabaseInfo {
  name: string;
  table_count: number;
  size_bytes: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function DatabasesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDatabases = async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setDatabases([
          { name: "sample_db", tableCount: 5, sizeBytes: 1024000 },
          { name: "wordpress", tableCount: 12, sizeBytes: 5242880 },
          { name: "laravel_app", tableCount: 0, sizeBytes: 0 },
        ]);
        return;
      }
      const list = await safeInvoke<RawDatabaseInfo[]>(
        TAURI_COMMANDS.services.listMysqlDatabasesDetailed,
      );
      setDatabases(
        (list ?? []).map((d) => ({
          name: d.name,
          tableCount: d.table_count,
          sizeBytes: d.size_bytes,
        })),
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.listFailed", "Failed to list databases"),
        description: `${err}`,
      });
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  const backupDatabase = async (name: string) => {
    setBusy(name);
    try {
      const result = await safeInvoke<string>(
        TAURI_COMMANDS.services.backupMysqlDatabaseNamed,
        { database: name },
      );
      toast({
        variant: "success",
        title: t("databases.backupCreated", "Backup created"),
        description: result ?? name,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.backupFailed", "Backup failed"),
        description: `${err}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const backupAll = async () => {
    setBusy("__all__");
    try {
      const result = await safeInvoke<string>(
        TAURI_COMMANDS.services.backupMysqlDatabase,
      );
      toast({
        variant: "success",
        title: t("databases.backupCreated", "Backup created"),
        description: result ?? "OK",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.backupFailed", "Backup failed"),
        description: `${err}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("__restore__");
    try {
      const sql = await file.text();
      const result = await safeInvoke<string>(
        TAURI_COMMANDS.services.restoreMysqlDatabase,
        { sql },
      );
      toast({
        variant: "success",
        title: t("databases.restoreCompleted", "Restore completed"),
        description: result ?? file.name,
      });
      await loadDatabases();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.restoreFailed", "Restore failed"),
        description: `${err}`,
      });
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openInPhpMyAdmin = (name: string) => {
    window.open(
      `http://localhost/phpmyadmin/?db=${encodeURIComponent(name)}`,
      "_blank",
    );
  };

  const copyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      toast({
        variant: "success",
        title: t("databases.copied", "Copied"),
        description: name,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.copyFailed", "Copy failed"),
        description: `${err}`,
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter((d) => d.name.toLowerCase().includes(q));
  }, [databases, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("navigation.databases", "Databases")}
          </h1>
          <p className="text-muted-foreground">
            {t(
              "pages.databases.description",
              "Backup, restore and inspect your local MySQL databases.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDatabases}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {t("actions.refresh", "Refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("http://localhost/phpmyadmin", "_blank")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("databases.openPhpMyAdmin", "phpMyAdmin")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("databases.actions", "Backup and restore")}</CardTitle>
          <CardDescription>
            {t(
              "databases.actionsDesc",
              "Full server backup uses mysqldump --all-databases. Restore reads any .sql file and pipes it to the mysql client.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={backupAll} disabled={busy !== null}>
            <Download className="mr-2 h-4 w-4" />
            {busy === "__all__"
              ? t("databases.backingUp", "Backing up...")
              : t("databases.backupAll", "Backup all databases")}
          </Button>
          <Button
            variant="outline"
            onClick={onPickFile}
            disabled={busy !== null}
          >
            <Upload className="mr-2 h-4 w-4" />
            {busy === "__restore__"
              ? t("databases.restoring", "Restoring...")
              : t("databases.restoreSql", "Restore from .sql")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,text/plain"
            className="hidden"
            onChange={onFileChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5" />
            {t("databases.list", "Databases")}
          </CardTitle>
          <CardDescription>
            {loading
              ? t("databases.loading", "Reading database list...")
              : search.trim()
                ? t(
                    "databases.countFiltered",
                    "{{shown}} of {{total}} databases",
                    { shown: filtered.length, total: databases.length },
                  )
                : t("databases.count", "{{count}} user databases found", {
                    count: databases.length,
                  })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="sticky top-0 z-10 -mx-6 -mt-2 mb-2 bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  "databases.searchPlaceholder",
                  "Filter databases by name...",
                )}
                className="pl-9"
                disabled={loading || databases.length === 0}
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : databases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "databases.empty",
                "No user databases yet. Create one in phpMyAdmin.",
              )}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("databases.noMatch", "No databases match your search.")}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((db) => (
                <ContextMenu key={db.name}>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">
                          {db.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("databases.tablesCount", "{{count}} tables", {
                            count: db.tableCount,
                          })}
                          <span className="mx-1.5">&middot;</span>
                          {formatBytes(db.sizeBytes)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => backupDatabase(db.name)}
                        disabled={busy !== null}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {busy === db.name
                          ? t("databases.backingUp", "Backing up...")
                          : t("databases.backup", "Backup")}
                      </Button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem
                      onSelect={() => backupDatabase(db.name)}
                      disabled={busy !== null}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t("databases.backup", "Backup")}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => openInPhpMyAdmin(db.name)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("databases.openInPhpMyAdmin", "Open in phpMyAdmin")}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => copyName(db.name)}>
                      <Copy className="mr-2 h-4 w-4" />
                      {t("databases.copyName", "Copy database name")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default DatabasesPage;
