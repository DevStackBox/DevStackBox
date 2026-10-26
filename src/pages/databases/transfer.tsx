import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDatabaseCache } from "@/context/database-cache-context";
import { useServiceStatus } from "@/context/service-status-context";
import {
  databaseInvoke,
  useDatabaseOperations,
  type DatabaseRequest,
} from "@/context/database-operations-context";
import { formatBytes } from "@/lib/utils";

export interface BackupRecord {
  id: string;
  database: string;
  path: string;
  created: number;
  size: number;
  checksum: string;
  engine: string;
  content: string;
  charset: string;
  collation: string;
  objects: string[];
  integrity: string;
  serverScope: boolean;
}
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
export function DatabaseTransferPage() {
  const { t } = useTranslation();
  const text = (key: string) => t(`databaseWorkspace.${key}`);
  const { databases } = useDatabaseCache();
  const { services } = useServiceStatus();
  const live = services.mysql.state === "running";
  const {
    operations,
    active,
    error: historyError,
    start,
    cancel,
  } = useDatabaseOperations();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("export");
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<DatabaseRequest["format"]>("sql");
  const [content, setContent] = useState<DatabaseRequest["content"]>("all");
  const [destination, setDestination] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupScope, setBackupScope] = useState("");
  const [serverReviewed, setServerReviewed] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [preview, setPreview] = useState<
    {
      file: string;
      size: number;
      databases: string[];
      engine: string[];
      warning: string;
    }[]
  >([]);

  useEffect(() => {
    const state = location.state as {
      tab?: string;
      sources?: string[];
      targets?: string[];
      database?: string;
    } | null;
    if (state) {
      setTab(state.tab ?? "export");
      setSelected(state.sources ?? []);
      setBackupScope(state.database ?? "");
      if (state.tab === "import") {
        setFiles(state.sources ?? []);
        setTargets(state.targets ?? (state.sources ?? []).map(() => ""));
        setReviewed(false);
        setPreview([]);
      }
    }
  }, [location.key]);
  const loadBackups = () =>
    databaseInvoke<BackupRecord[]>("database_backups")
      .then(setBackups)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    if (tab === "backups") void loadBackups();
  }, [tab, active]);
  const run = async (kind: DatabaseRequest["kind"]) => {
    setError(null);
    try {
      await start({
        kind,
        sources: kind === "import" ? files : selected,
        targets:
          kind === "import" ? targets.map((value) => value.trim() || null) : [],
        format: kind === "backup" ? "sql" : format,
        content: kind === "backup" ? "all" : content,
        destination: destination || null,
        reviewed,
      });
      setTab("activity");
      setReviewed(false);
    } catch (e) {
      setError(String(e));
    }
  };
  const inspect = async (paths: string[]) => {
    setReviewed(false);
    setPreview([]);
    setChecking("preview");
    try {
      const result = await databaseInvoke<typeof preview>(
        "inspect_database_files",
        { paths },
      );
      setPreview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(null);
    }
  };
  const pickFiles = async () => {
    try {
      const paths = await databaseInvoke<string[]>("pick_database_files");
      if (paths.length) {
        setFiles(paths);
        setTargets(paths.map(() => backupScope));
        await inspect(paths);
      }
    } catch (e) {
      setError(String(e));
    }
  };
  const restore = (record: BackupRecord) => {
    setFiles([record.path]);
    setTargets([record.serverScope ? "" : record.database]);
    setTab("import");
    setReviewed(false);
    void inspect([record.path]);
  };
  const folder = async (path: string) => {
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="space-y-5">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={text("transfer")}
      >
        {["export", "import", "backups", "activity"].map((key) => (
          <Button
            key={key}
            aria-pressed={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => {
              setTab(key);
              setError(null);
            }}
          >
            {text(key)}
          </Button>
        ))}
      </div>
      {(error || historyError) && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm"
        >
          {error || historyError}
        </p>
      )}
      {!live && (
        <p className="rounded-md border p-3 text-sm">
          {text("offlineTransfers")}
        </p>
      )}
      {tab === "export" && (
        <section className="rounded-lg border bg-card p-5 space-y-5">
          <h2 className="text-lg font-semibold">{text("export")}</h2>
          <p className="text-sm text-muted-foreground">
            {text("exportDescription")}
          </p>
          <fieldset
            disabled={!live || active}
            className="space-y-4 disabled:opacity-60"
          >
            <legend className="font-medium mb-2">
              {text("selectDatabases")}
            </legend>
            <div className="max-h-64 overflow-auto rounded-md border p-3 space-y-2">
              {databases.map((db) => (
                <label className="flex items-center gap-3" key={db.name}>
                  <input
                    type="checkbox"
                    checked={selected.includes(db.name)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, db.name]
                          : selected.filter((name) => name !== db.name),
                      )
                    }
                  />
                  <span className="font-mono text-sm">{db.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBytes(db.sizeBytes)}
                  </span>
                </label>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() =>
                setSelected(
                  selected.length === databases.length
                    ? []
                    : databases.map((d) => d.name),
                )
              }
            >
              {text("toggleAll")}
            </Button>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 block">
                {text("content")}
                <select
                  className={selectClass}
                  value={content}
                  onChange={(e) => setContent(e.target.value as typeof content)}
                >
                  {["all", "structure", "data"].map((key) => (
                    <option key={key} value={key}>
                      {text(key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 block">
                {text("format")}
                <select
                  className={selectClass}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="sql">SQL</option>
                  <option value="gzip">SQL.GZ</option>
                  <option value="zip">DevStackBox ZIP</option>
                </select>
              </label>
            </div>
            <label className="block space-y-2">
              {text("destination")}
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={destination}
                  aria-label={text("destination")}
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const path = await databaseInvoke<string | null>(
                        "pick_database_destination",
                      );
                      if (path) setDestination(path);
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {text("browse")}
                </Button>
              </div>
            </label>
            <p className="text-sm text-muted-foreground">
              {text("exportPolicy")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!selected.length || !destination}
                onClick={() => void run("export")}
              >
                {text("exportSelected")} ({selected.length})
              </Button>
              <Button
                variant="outline"
                disabled={!selected.length}
                onClick={() => void run("backup")}
              >
                {text("backupSelected")}
              </Button>
            </div>
          </fieldset>
        </section>
      )}
      {tab === "import" && (
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">{text("import")}</h2>
          <p className="text-sm text-muted-foreground">
            {text("importDescription")}
          </p>
          <Button
            variant="outline"
            disabled={active}
            onClick={() => void pickFiles()}
          >
            {text("chooseFiles")}
          </Button>
          <div className="space-y-3">
            {files.map((file, i) => (
              <div key={file} className="rounded-md border p-3 space-y-2">
                <p className="break-all font-mono text-sm">{file}</p>
                <label className="block text-sm">
                  {text("initialDatabase")}
                  <Input
                    value={targets[i] ?? ""}
                    disabled={active || file.toLowerCase().endsWith(".zip")}
                    onChange={(e) => {
                      setTargets(
                        targets.map((value, index) =>
                          index === i ? e.target.value : value,
                        ),
                      );
                      setReviewed(false);
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {targets[i]
                    ? databases.some((db) => db.name === targets[i])
                      ? text("existingTarget")
                      : text("newTarget")
                    : text("originalNames")}
                </p>
              </div>
            ))}
          </div>
          {files.length > 0 && (
            <Button
              variant="outline"
              disabled={checking !== null || active}
              onClick={() => void inspect(files)}
            >
              {checking === "preview" ? text("checking") : text("reviewFiles")}
            </Button>
          )}
          {preview.map((item) => (
            <div
              key={item.file}
              className="border rounded-md p-3 text-sm space-y-1"
            >
              <p className="break-all">
                {item.file} · {formatBytes(item.size)}
              </p>
              {item.databases.length > 0 && (
                <p>
                  {text("packageTargets")}: {item.databases.join(", ")}
                </p>
              )}
              {item.engine.length > 0 && (
                <p>
                  {text("sourceEngine")}: {item.engine.join("; ")}
                </p>
              )}
              <p>{item.warning}</p>
            </div>
          ))}
          <p className="rounded-md border border-amber-500/50 p-3 text-sm">
            {text("importRisk")}
          </p>
          <label className="flex gap-3 items-start text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={
                active || preview.length !== files.length || !files.length
              }
            />
            {text("reviewAcknowledgement")}
          </label>
          <Button
            disabled={
              !live ||
              active ||
              !reviewed ||
              !files.length ||
              preview.length !== files.length
            }
            onClick={() => void run("import")}
          >
            {text("startImport")}
          </Button>
        </section>
      )}
      {tab === "backups" && (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <h2 className="text-lg font-semibold">{text("backups")}</h2>
            <Button variant="outline" onClick={() => void loadBackups()}>
              {text("refresh")}
            </Button>
            <Button
              disabled={!live || active}
              onClick={() => {
                setSelected(
                  backupScope ? [backupScope] : databases.map((d) => d.name),
                );
                setTab("export");
              }}
            >
              {text("backupNow")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {text("backupDescription")}
          </p>
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm">{text("serverBackupWarning")}</p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={serverReviewed}
                onChange={(e) => setServerReviewed(e.target.checked)}
              />
              {text("serverBackupAcknowledgement")}
            </label>
            <Button
              disabled={!live || active || !serverReviewed}
              onClick={async () => {
                try {
                  await start({
                    kind: "serverBackup",
                    sources: ["server"],
                    targets: [],
                    format: "sql",
                    content: "all",
                    destination: null,
                    reviewed: true,
                  });
                  setServerReviewed(false);
                  setTab("activity");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              {text("serverBackup")}
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/databases/legacy-backups")}
          >
            {text("legacyTools")}
          </Button>
          <Input
            aria-label={text("filterBackups")}
            placeholder={text("filterBackups")}
            value={backupScope}
            onChange={(e) => setBackupScope(e.target.value)}
          />
          {backups
            .filter((record) =>
              record.database.toLowerCase().includes(backupScope.toLowerCase()),
            )
            .map((record) => (
              <article
                className="rounded-md border bg-card p-4 space-y-2"
                key={record.id}
              >
                <div className="flex flex-wrap gap-3 justify-between">
                  <strong>{record.database}</strong>
                  <span className="text-sm">
                    {new Date(record.created * 1000).toLocaleString()} ·{" "}
                    {formatBytes(record.size)}
                  </span>
                </div>
                <p className="break-all text-xs font-mono">{record.path}</p>
                <p className="text-sm">
                  {record.engine} · {record.charset} / {record.collation}
                </p>
                <p className="text-sm">
                  {text(record.integrity)} · {text("restoreNotVerified")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      active ||
                      ["missing", "checksumMismatch"].includes(record.integrity)
                    }
                    onClick={() => restore(record)}
                  >
                    {text("restore")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      checking !== null || record.integrity === "missing"
                    }
                    onClick={async () => {
                      setChecking(record.id);
                      try {
                        const integrity = await databaseInvoke<string>(
                          "verify_database_backup",
                          { id: record.id },
                        );
                        setBackups(
                          backups.map((b) =>
                            b.id === record.id ? { ...b, integrity } : b,
                          ),
                        );
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setChecking(null);
                      }
                    }}
                  >
                    {text("verifyIntegrity")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void folder(record.path)}
                  >
                    {text("openFolder")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={active}
                    onClick={() => {
                      setDeleteTarget(record);
                      setDeleteName("");
                    }}
                  >
                    {text("deleteBackup")}
                  </Button>
                </div>
              </article>
            ))}
          {!backups.length && <p>{text("noBackups")}</p>}
          {deleteTarget && (
            <div
              role="group"
              aria-label={text("deleteBackup")}
              className="rounded-md border border-destructive p-4 space-y-3"
            >
              <p>
                {text("deleteBackupWarning")}{" "}
                <strong>{deleteTarget.database}</strong>
              </p>
              <Input
                aria-label={text("typeName")}
                placeholder={text("typeName")}
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
              />
              <Button
                variant="destructive"
                disabled={deleteName !== deleteTarget.database || active}
                onClick={async () => {
                  try {
                    await databaseInvoke("delete_database_backup", {
                      id: deleteTarget.id,
                    });
                    setDeleteTarget(null);
                    await loadBackups();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                {text("deleteBackup")}
              </Button>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {text("cancel")}
              </Button>
            </div>
          )}
        </section>
      )}
      {tab === "activity" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{text("activity")}</h2>
          <p className="text-sm text-muted-foreground">
            {text("activityDescription")}
          </p>
          {!operations.length && <p>{text("noActivity")}</p>}
          {operations.map((op) => (
            <article
              key={op.id}
              className="rounded-md border bg-card p-4 space-y-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {text(op.kind)} · {text(op.status)}
                </strong>
                <span className="text-sm">
                  {new Date(op.started * 1000).toLocaleString()}
                </span>
              </div>
              {op.error && (
                <p role="alert" className="text-sm">
                  {op.error}
                </p>
              )}
              <ul className="divide-y">
                {op.items.map((item, index) => (
                  <li key={index} className="py-2 text-sm space-y-1">
                    <p className="break-all">
                      {item.source} {item.target ? `→ ${item.target}` : ""}
                    </p>
                    <p>
                      {text(item.status)}
                      {item.bytes > 0
                        ? ` · ${formatBytes(item.bytes)} ${text("processed")}`
                        : ""}
                    </p>
                    {item.error && <p>{item.error}</p>}
                    {item.output && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void folder(item.output!)}
                      >
                        {text("openFolder")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {["queued", "running"].includes(op.status) && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void cancel(op.id).catch((e) => setError(String(e)))
                  }
                >
                  {text("cancelOperation")}
                </Button>
              )}
              {!active &&
                op.kind === "import" &&
                op.items.some((item) =>
                  ["notStarted", "failed", "cancelled", "interrupted"].includes(
                    item.status,
                  ),
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const remaining = op.items.filter(
                        (item) => item.status !== "completed",
                      );
                      navigate("/databases/import-export", {
                        state: {
                          tab: "import",
                          sources: remaining.map((i) => i.source),
                          targets: remaining.map((i) => i.target ?? ""),
                        },
                      });
                    }}
                  >
                    {text("reviewRemaining")}
                  </Button>
                )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
