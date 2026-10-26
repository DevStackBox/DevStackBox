import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDatabaseCache } from "@/context/database-cache-context";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type SqlRestoreMode = "follow_dump" | "initial_database";

interface SqlRestoreFileInfo {
  path: string;
  fileName: string;
  sizeBytes: number;
  suggestsFollowDump: boolean;
  hintMessage?: string | null;
}

interface RestoreSqlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished: () => void;
}

export function RestoreSqlDialog({
  open,
  onOpenChange,
  onFinished,
}: RestoreSqlDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { databases } = useDatabaseCache(open);

  const [fileInfo, setFileInfo] = useState<SqlRestoreFileInfo | null>(null);
  const [mode, setMode] = useState<SqlRestoreMode>("follow_dump");
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [newDbName, setNewDbName] = useState("");
  const [useNewDb, setUseNewDb] = useState(false);
  const [createIfMissing, setCreateIfMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);

  const reset = useCallback(() => {
    setFileInfo(null);
    setMode("follow_dump");
    setSelectedDb("");
    setNewDbName("");
    setUseNewDb(false);
    setCreateIfMissing(true);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (importing) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pickFile = async () => {
    setPicking(true);
    try {
      const path = await safeInvoke<string | null>(
        TAURI_COMMANDS.services.pickSqlRestoreFile,
      );
      if (!path) return;
      const info = await safeInvoke<SqlRestoreFileInfo>(
        TAURI_COMMANDS.services.getSqlRestoreFileInfo,
        { path },
      );
      if (!info) return;
      setFileInfo(info);
      if (info.suggestsFollowDump) {
        setMode("follow_dump");
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.restoreFailed", "Restore failed"),
        description: String(err),
      });
    } finally {
      setPicking(false);
    }
  };

  const runImport = async () => {
    if (!fileInfo) return;
    if (mode === "initial_database") {
      const name = (useNewDb ? newDbName : selectedDb).trim();
      if (!name) {
        toast({
          variant: "destructive",
          title: t("databases.restoreFailed", "Restore failed"),
          description: t(
            "databases.restoreNeedDatabase",
            "Choose or enter a database name.",
          ),
        });
        return;
      }
    }

    setImporting(true);
    try {
      const initialDatabase =
        mode === "initial_database"
          ? (useNewDb ? newDbName : selectedDb).trim()
          : undefined;
      const result = await safeInvoke<string>(
        TAURI_COMMANDS.services.restoreMysqlFromFile,
        {
          filePath: fileInfo.path,
          restoreMode: mode,
          initialDatabase: initialDatabase ?? null,
          createDatabase: mode === "initial_database" && createIfMissing,
        },
      );
      toast({
        variant: "success",
        title: t("databases.restoreCompleted", "Restore completed"),
        description: result ?? fileInfo.fileName,
      });
      handleOpenChange(false);
      onFinished();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.restoreFailed", "Restore failed"),
        description: String(err),
      });
      onFinished();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("databases.restoreSqlTitle", "Restore from .sql file")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "databases.restorePartialWarning",
              "Import may partially apply before failing; there is no automatic rollback. For very large dumps, use this dialog instead of phpMyAdmin.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void pickFile()}
              disabled={importing || picking}
            >
              {picking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t("databases.chooseSqlFile", "Choose .sql file…")}
            </Button>
            {fileInfo && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {fileInfo.fileName} ({formatBytes(fileInfo.sizeBytes)})
              </span>
            )}
          </div>

          {fileInfo?.suggestsFollowDump && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              {t(
                "databases.restoreHintCreateDatabase",
                "This file appears to contain CREATE DATABASE statements. Use “Restore using database names in the file”.",
              )}
            </p>
          )}

          <div className="space-y-2" role="radiogroup">
            {(
              [
                ["follow_dump", "databases.restoreModeFollow"],
                ["initial_database", "databases.restoreModeInitial"],
              ] as const
            ).map(([value, key]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                disabled={importing}
                onClick={() => setMode(value)}
                className={cn(
                  "w-full rounded-md border p-3 text-left text-sm transition-colors",
                  mode === value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                {t(
                  key,
                  value === "follow_dump"
                    ? "Restore using database names in the file (recommended for DevStackBox backups and mysqldump --databases)"
                    : "Use a selected database when the file does not specify one (does not override USE or CREATE DATABASE inside the file)",
                )}
              </button>
            ))}
          </div>

          {mode === "initial_database" && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="use-new-db"
                  checked={useNewDb}
                  onCheckedChange={setUseNewDb}
                  disabled={importing}
                />
                <Label htmlFor="use-new-db">
                  {t("databases.restoreCreateNew", "Create / use a new database name")}
                </Label>
              </div>
              {useNewDb ? (
                <Input
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder={t("databases.newDbPlaceholder", "my_database")}
                  disabled={importing}
                />
              ) : (
                <Select
                  value={selectedDb}
                  onValueChange={setSelectedDb}
                  disabled={importing}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "databases.selectDatabase",
                        "Select existing database",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((db) => (
                      <SelectItem key={db.name} value={db.name}>
                        {db.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="create-if-missing"
                  checked={createIfMissing}
                  onCheckedChange={setCreateIfMissing}
                  disabled={importing}
                />
                <Label htmlFor="create-if-missing">
                  {t(
                    "databases.createIfNotExists",
                    "Create database if it does not exist",
                  )}
                </Label>
              </div>
            </div>
          )}

          {importing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("databases.restoring", "Restoring…")}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => void runImport()}
            disabled={!fileInfo || importing}
          >
            {importing
              ? t("databases.restoring", "Restoring…")
              : t("databases.restoreConfirm", "Start import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
