import { useEffect, useRef, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import {
  Database as DatabaseIcon,
  Download,
  Upload,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

export function DatabasesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDatabases = async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setDatabases(["sample_db", "wordpress", "laravel_app"]);
        return;
      }
      const list = await safeInvoke<string[]>(
        TAURI_COMMANDS.services.listMysqlDatabases,
      );
      setDatabases(list ?? []);
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
              : t("databases.count", "{{count}} user databases found", {
                  count: databases.length,
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : databases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "databases.empty",
                "No user databases yet. Create one in phpMyAdmin.",
              )}
            </p>
          ) : (
            databases.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
              >
                <span className="font-mono text-sm">{name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => backupDatabase(name)}
                  disabled={busy !== null}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {busy === name
                    ? t("databases.backingUp", "Backing up...")
                    : t("databases.backup", "Backup")}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default DatabasesPage;
