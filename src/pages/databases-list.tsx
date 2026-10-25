import { useNavigate } from "react-router-dom";
import {
  databaseInvoke,
  useDatabaseOperations,
} from "@/context/database-operations-context";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MySQLRequired } from "@/components/mysql-required";
import { useEffect, useMemo, useState } from "react";
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
import { safeInvoke, openExternalUrl } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import {
  Database as DatabaseIcon,
  Download,
  RefreshCw,
  ExternalLink,
  Search,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import { useDatabaseCache } from "@/context/database-cache-context";
import { formatBytes } from "@/lib/utils";
import {
  phpMyAdminUrlForDatabase,
  getPhpMyAdminBaseUrl,
} from "@/lib/phpmyadmin";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export function DatabasesPage() {
  return (
    <MySQLRequired>
      <DatabasesPageContent />
    </MySQLRequired>
  );
}

function DatabasesPageContent() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { active, start } = useDatabaseOperations();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [charset, setCharset] = useState("");
  const [collation, setCollation] = useState("");
  const [collations, setCollations] = useState<
    { charset: string; collation: string }[]
  >([]);
  const transfer = (tab: string, names: string[]) =>
    navigate("/databases/import-export", {
      state: {
        tab,
        sources: tab === "import" ? [] : names,
        database: names.length === 1 ? names[0] : "",
      },
    });

  // All fetching is owned by DatabaseCacheProvider - no local fetch here.
  const {
    databases,
    loading,
    hasCache,
    error,
    refresh,
    lastSuccessfulRefresh,
  } = useDatabaseCache();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    setConfirmation("");
  }, [dropTarget]);
  useEffect(() => {
    if (createOpen)
      void databaseInvoke<typeof collations>("database_collations")
        .then(setCollations)
        .catch(() => setCollations([]));
  }, [createOpen]);

  // Lazy warmup: trigger the first fetch when this page is first visited.
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const backupDatabase = async (name: string) => {
    setBusy(name);
    try {
      await start({
        kind: "backup",
        sources: [name],
        targets: [],
        format: "sql",
        content: "all",
        destination: null,
        reviewed: false,
      });
      navigate("/databases/import-export", { state: { tab: "activity" } });
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

  const openInPhpMyAdmin = (name: string) => {
    void phpMyAdminUrlForDatabase(name).then((url) => openExternalUrl(url));
  };

  const createDatabase = async () => {
    const name = newDbName.trim();
    if (!name || active) return;
    setBusy("__create__");
    try {
      await databaseInvoke("create_database_with_options", {
        name,
        charset: charset || null,
        collation: collation || null,
      });
      toast({
        variant: "success",
        title: t("databases.created", "Database created"),
        description: name,
      });
      setCreateOpen(false);
      setNewDbName("");
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.createFailed", "Create failed"),
        description: String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const dropDatabase = async () => {
    if (!dropTarget || confirmation !== dropTarget || active) return;
    setBusy(dropTarget);
    try {
      await safeInvoke(TAURI_COMMANDS.services.dropMysqlDatabase, {
        name: dropTarget,
      });
      toast({
        variant: "success",
        title: t("databases.dropped", "Database dropped"),
        description: dropTarget,
      });
      setDropTarget(null);
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("databases.dropFailed", "Drop failed"),
        description: String(err),
      });
    } finally {
      setBusy(null);
    }
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

  if (error && !hasCache)
    return (
      <div role="alert" className="rounded-md border p-6 space-y-3">
        <h2 className="font-semibold">Could not read databases</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => void refresh()} disabled={loading}>
          Try again
        </Button>
      </div>
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {lastSuccessfulRefresh && (
        <p className="text-xs text-muted-foreground">
          {t("databaseWorkspace.lastRefresh")}:{" "}
          {new Date(lastSuccessfulRefresh).toLocaleString()}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border p-3">
          {t("databaseWorkspace.stale")} {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t("databaseWorkspace.databases"), databases.length],
          [
            t("databaseWorkspace.tables"),
            databases.reduce((sum, db) => sum + db.tableCount, 0),
          ],
          [
            t("databaseWorkspace.estimatedSize"),
            formatBytes(databases.reduce((sum, db) => sum + db.sizeBytes, 0)),
          ],
        ].map(([label, value]) => (
          <div className="border rounded-md p-4" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{hasCache ? value : "-"}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
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
          disabled={active}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("databases.create", "Create")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void getPhpMyAdminBaseUrl().then((url) => openExternalUrl(url))
          }
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t("databases.openPhpMyAdmin", "phpMyAdmin")}
        </Button>
      </div>

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
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={
                  filtered.length > 0 &&
                  filtered.every((db) => selected.includes(db.name))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...filtered.map((db) => db.name),
                          ]),
                        ]
                      : selected.filter(
                          (name) => !filtered.some((db) => db.name === name),
                        ),
                  )
                }
              />
              {t("databaseWorkspace.selectVisible")}
            </label>
            <span className="text-sm">
              {selected.length} {t("databaseWorkspace.selected")}
            </span>
            <Button size="sm" variant="outline" onClick={() => setSelected([])}>
              {t("databaseWorkspace.clear")}
            </Button>
            <Button
              size="sm"
              disabled={!selected.length || active}
              onClick={() => transfer("export", selected)}
            >
              {t("databaseWorkspace.exportSelected")}
            </Button>
          </div>
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

          {/* Skeleton only on first-ever load (no session cache yet) */}
          {loading && !hasCache ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : databases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "databases.emptyCreate",
                "No user databases yet. Select Create to add your first database.",
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
                      <input
                        className="mr-3"
                        type="checkbox"
                        aria-label={`${t("databaseWorkspace.select")} ${db.name}`}
                        checked={selected.includes(db.name)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, db.name]
                              : selected.filter((name) => name !== db.name),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">
                          {db.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("databases.tablesCount", "{{count}} tables", {
                            count: db.tableCount,
                          })}
                          <span className="mx-1.5">&middot;</span>
                          {formatBytes(db.sizeBytes)} · {db.viewCount ?? 0}{" "}
                          {t("databaseWorkspace.views")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/databases/database/${encodeURIComponent(db.name)}`,
                          )
                        }
                      >
                        {t("databaseWorkspace.manage")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${t("databaseWorkspace.actions")} ${db.name}`}
                          >
                            ⋯
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            disabled={active}
                            onSelect={() => transfer("export", [db.name])}
                          >
                            {t("databaseWorkspace.export")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={active}
                            onSelect={() => transfer("import", [db.name])}
                          >
                            {t("databaseWorkspace.import")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={active}
                            onSelect={() => void backupDatabase(db.name)}
                          >
                            {t("databaseWorkspace.backupNow")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => openInPhpMyAdmin(db.name)}
                          >
                            phpMyAdmin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void copyName(db.name)}
                          >
                            {t("databases.copyName")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={active}
                            className="text-destructive"
                            onSelect={() => setDropTarget(db.name)}
                          >
                            {t("databases.drop")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => backupDatabase(db.name)}
                        disabled={busy !== null || active}
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
                      disabled={busy !== null || active}
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
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDropTarget(db.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("databases.drop", "Drop database")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("databases.createTitle", "Create database")}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newDbName}
            onChange={(e) => setNewDbName(e.target.value)}
            placeholder={t("databases.namePlaceholder", "my_app_db")}
            autoFocus
            aria-label={t("databaseWorkspace.name")}
          />
          <label className="text-sm space-y-1">
            {t("databaseWorkspace.charset")}
            <select
              className="w-full rounded border bg-background p-2"
              value={charset}
              onChange={(e) => {
                setCharset(e.target.value);
                setCollation("");
              }}
            >
              <option value="">{t("databaseWorkspace.serverDefault")}</option>
              {[...new Set(collations.map((c) => c.charset))].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            {t("databaseWorkspace.collation")}
            <select
              className="w-full rounded border bg-background p-2"
              value={collation}
              onChange={(e) => setCollation(e.target.value)}
              disabled={!charset}
            >
              <option value="">{t("databaseWorkspace.serverDefault")}</option>
              {collations
                .filter((c) => c.charset === charset)
                .map((c) => (
                  <option key={c.collation}>{c.collation}</option>
                ))}
            </select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => void createDatabase()}
              disabled={busy === "__create__" || !newDbName.trim()}
            >
              {t("databases.create", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dropTarget !== null}
        onOpenChange={(o) => !o && setDropTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("databases.dropConfirmTitle", "Drop database?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "databases.dropConfirmDescription",
                "This permanently deletes {{name}} and all its data.",
                { name: dropTarget ?? "" },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="space-y-2 text-sm">
            {t("databaseWorkspace.typeName")}
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmation !== dropTarget || active || busy !== null}
              onClick={(e) => {
                e.preventDefault();
                void dropDatabase();
              }}
            >
              {t("databases.drop", "Drop database")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

export default DatabasesPage;
