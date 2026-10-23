import { MySQLRequired } from "@/components/mysql-required";
import { RestoreSqlDialog } from "@/components/restore-sql-dialog";
import { useDatabaseCache } from "@/context/database-cache-context";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { RefreshCw, Download, HardDriveDownload, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";

export function DatabasesBackupsPage() {
  return <MySQLRequired><DatabasesBackupsContent /></MySQLRequired>;
}

function DatabasesBackupsContent() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { databases, loading, error, refresh: load } = useDatabaseCache();
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [applyingPhpLimits, setApplyingPhpLimits] = useState(false);
  useEffect(() => { void load(); }, [load]);

  const applyPhpImportLimits = async () => {
    setApplyingPhpLimits(true);
    try {
      const result = await safeInvoke<string>(
        TAURI_COMMANDS.services.applyPhpRecommendedImportLimits,
      );
      toast({
        variant: "success",
        title: t("databases.applyPhpImportLimitsDone", "PHP import limits updated"),
        description: result,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: String(err),
      });
    } finally {
      setApplyingPhpLimits(false);
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

  const backup = async (name: string) => {
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
        title: t("common.error", "Error"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div role="alert" className="rounded-md border p-6 space-y-3"><p>{error}</p><Button disabled={loading} onClick={() => void load()}>{t("common.tryAgain", "Try again")}</Button></div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("databases.actions", "Backup and restore")}</CardTitle>
          <CardDescription>
            {t(
              "databases.actionsDescV016",
              "Full server backup uses mysqldump --all-databases. Restore streams any .sql file from disk through the MySQL client (recommended for large dumps). phpMyAdmin supports smaller uploads up to your configured PHP limit.",
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
            onClick={() => setRestoreOpen(true)}
            disabled={busy !== null}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("databases.restoreSql", "Restore from .sql")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void applyPhpImportLimits()}
            disabled={busy !== null || applyingPhpLimits}
            title={t(
              "databases.applyPhpImportLimitsDesc",
              "Sets upload 512M, post 544M, and 600s execution time in global php.ini for phpMyAdmin. Restart Apache afterward.",
            )}
          >
            {applyingPhpLimits
              ? t("common.loading", "Loading…")
              : t(
                  "databases.applyPhpImportLimits",
                  "Apply recommended PHP import limits",
                )}
          </Button>
        </CardContent>
      </Card>

      <RestoreSqlDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        onFinished={() => void load()}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDriveDownload className="h-4 w-4" />
                {t("databases.backups.title", "Per-database backups")}
              </CardTitle>
              <CardDescription>
                {t(
                  "databases.backups.description",
                  "Export individual MySQL databases. Settings > Backup & Restore includes configuration, www files and an optional SQL dump; logs and external project files are excluded.",
                )}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {t("actions.refresh", "Refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {databases.length === 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {t("databases.emptyBackupsList", "No databases to back up yet.")}
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {databases.map((db) => (
                <div
                  key={db.name}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div>
                    <div className="font-mono text-sm">{db.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("databases.tablesCount", "{{count}} tables", {
                        count: db.tableCount,
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => backup(db.name)}
                    disabled={busy === db.name}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("actions.backup", "Backup")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default DatabasesBackupsPage;
