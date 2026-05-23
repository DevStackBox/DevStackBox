import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  Archive,
  Trash2,
  RotateCcw,
  FolderOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TAURI_COMMANDS } from "@/lib/commands";
import { isTauri } from "@/lib/tauri";

interface BackupInfo {
  path: string;
  filename: string;
  size_bytes: number;
  created_at_secs: number;
}

interface BackupProgress {
  stage: string;
  percent: number;
  message: string;
}

interface FullBackupResult {
  path: string;
  mysql_included: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(secs: number): string {
  return new Date(secs * 1000).toLocaleString();
}

export function BackupPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BackupInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<BackupInfo[]>(TAURI_COMMANDS.backup.listFull);
      setBackups(list ?? []);
    } catch (err) {
      console.error("list_full_backups failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  // Auto-dismiss feedback after 6s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleCreate = async () => {
    setCreating(true);
    setProgress({ stage: "preparing", percent: 0, message: "Preparing..." });

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<BackupProgress>(
          "full-backup-progress",
          (event) => setProgress(event.payload),
        );
      } catch {
        // non-fatal
      }
    }

    try {
      const ts = new Date().toISOString();
      const result = await invoke<FullBackupResult>(
        TAURI_COMMANDS.backup.createFull,
        { timestamp: ts },
      );
      const msg = result.mysql_included
        ? `Backup saved: ${result.path}`
        : `Backup created but MySQL databases were NOT included — MySQL was not running. Start MySQL and create another backup to include database data.`;
      setFeedback({ ok: result.mysql_included, message: msg });
      await loadBackups();
    } catch (err) {
      setFeedback({ ok: false, message: String(err) });
    } finally {
      unlisten?.();
      setCreating(false);
      setProgress(null);
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoring(true);
    setProgress({
      stage: "preparing",
      percent: 0,
      message: "Starting restore...",
    });

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<BackupProgress>(
          "full-backup-progress",
          (event) => setProgress(event.payload),
        );
      } catch {
        // non-fatal
      }
    }

    try {
      await invoke(TAURI_COMMANDS.backup.restoreFull, {
        path: confirmRestore.path,
      });
      setFeedback({
        ok: true,
        message:
          "Restore complete. Please restart services for changes to take effect.",
      });
    } catch (err) {
      setFeedback({ ok: false, message: String(err) });
    } finally {
      unlisten?.();
      setRestoring(false);
      setProgress(null);
      setConfirmRestore(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await invoke(TAURI_COMMANDS.backup.deleteFull, {
        path: confirmDelete.path,
      });
      await loadBackups();
      setFeedback({ ok: true, message: "Backup deleted." });
    } catch (err) {
      setFeedback({ ok: false, message: String(err) });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke(TAURI_COMMANDS.backup.openFolder);
    } catch (err) {
      setFeedback({ ok: false, message: String(err) });
    }
  };

  const busy = creating || restoring;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenFolder}
            disabled={busy}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Folder
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadBackups}
            disabled={busy || loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

      {/* Progress card */}
      {progress && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progress.message}</span>
              <span className="font-mono text-xs">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            feedback.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30"
              : "bg-destructive/10 text-destructive border border-destructive/30"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* What is included card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">
            What is included
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>
              All configuration files (httpd.conf, my.cnf, php.ini, ssl.conf,
              vhosts.json, phpmyadmin.conf)
            </li>
            <li>All files in your web root (www/)</li>
            <li>
              MySQL databases via mysqldump (all-databases.sql) — requires MySQL
              to be running
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Binaries (Apache, PHP, MySQL) are not included — they can be
            reinstalled.
          </p>
        </CardContent>
      </Card>

      {/* Backup list */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Saved Backups
            <Badge variant="secondary" className="ml-1">
              {backups.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No backups yet. Click &quot;Create Backup&quot; to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.path}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{b.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.created_at_secs)} &middot;{" "}
                      {formatBytes(b.size_bytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmRestore(b)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => setConfirmDelete(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <AlertDialog
        open={!!confirmRestore}
        onOpenChange={(open) => !open && setConfirmRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite your current configuration files and web root
              with the contents of{" "}
              <span className="font-mono">{confirmRestore?.filename}</span>. If
              MySQL data was included, all current databases will be replaced.
              Consider creating a fresh backup of your current state first.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRestore}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{confirmDelete?.filename}</span> will
              be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

export default BackupPage;
