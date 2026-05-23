import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { RefreshCw, Download, HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";

interface RawDatabaseInfo {
  name: string;
  table_count: number;
  size_bytes: number;
}

export function DatabasesBackupsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [databases, setDatabases] = useState<RawDatabaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTauri()) {
      setDatabases([]);
      return;
    }
    setLoading(true);
    try {
      const list = await safeInvoke<RawDatabaseInfo[]>(
        TAURI_COMMANDS.services.listMysqlDatabasesDetailed,
      );
      setDatabases(list ?? []);
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
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
                  "Quickly export individual MySQL databases. For full-stack backups including configs and logs, use Settings > Backup & Restore.",
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
              {t("databases.empty", "No databases found.")}
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
                      {db.table_count} tables
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
