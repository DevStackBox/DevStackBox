import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDatabaseCache } from "@/context/database-cache-context";
import { databaseInvoke } from "@/context/database-operations-context";

const privileges = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "ALTER",
  "INDEX",
  "DROP",
  "REFERENCES",
  "CREATE VIEW",
  "SHOW VIEW",
  "TRIGGER",
  "EXECUTE",
  "CREATE ROUTINE",
  "ALTER ROUTINE",
  "EVENT",
  "CREATE TEMPORARY TABLES",
  "LOCK TABLES",
];
export function DatabasePermissions({
  account,
  initialDatabase,
  onClose,
}: {
  account: { user: string; host: string } | null;
  initialDatabase?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`databaseWorkspace.${key}`);
  const { databases, refresh } = useDatabaseCache();
  const [database, setDatabase] = useState(initialDatabase ?? "");
  const [original, setOriginal] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (account) void refresh();
  }, [account, refresh]);
  useEffect(() => {
    setLoaded(false);
    setOriginal([]);
    setSelected([]);
    if (!account || !database) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    databaseInvoke<string[]>("database_grants", {
      username: account.user,
      host: account.host,
      database,
    })
      .then((grants) => {
        if (!cancelled) {
          setOriginal(grants);
          setSelected(grants);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, database]);
  const additions = selected.filter((p) => !original.includes(p));
  const removals = original.filter(
    (p) => privileges.includes(p) && !selected.includes(p),
  );
  const preset = (values: string[]) =>
    setSelected([
      ...original.filter((p) => !privileges.includes(p)),
      ...values,
    ]);
  return (
    <Dialog
      open={account !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {text("permissions")} · {account?.user}@{account?.host}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {text("grantLimitations")}
        </p>
        <label className="text-sm">
          {text("databases")}
          <select
            className="w-full p-2 border rounded bg-background"
            disabled={loading}
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
          >
            <option value="">{text("selectDatabases")}</option>
            {databases.map((db) => (
              <option key={db.name}>{db.name}</option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        {loaded && (
          <>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => preset(["SELECT"])}
              >
                {text("readOnly")}
              </Button>
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => preset(["SELECT", "INSERT", "UPDATE", "DELETE"])}
              >
                {text("readWrite")}
              </Button>
            </div>
            <p className="text-sm">{text("grantWarning")}</p>
            <fieldset disabled={loading} className="grid grid-cols-2 gap-2">
              {privileges.map((p) => (
                <label key={p} className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(p)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p]
                          : selected.filter((v) => v !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </fieldset>
            <div className="rounded border p-3 text-sm">
              <p>
                {text("additions")}: {additions.join(", ") || "—"}
              </p>
              <p>
                {text("removals")}: {removals.join(", ") || "—"}
              </p>
            </div>
            <Button
              disabled={loading || (!additions.length && !removals.length)}
              onClick={async () => {
                if (!account) return;
                setLoading(true);
                try {
                  await databaseInvoke("set_database_grants", {
                    username: account.user,
                    host: account.host,
                    database,
                    additions,
                    removals,
                  });
                  onClose();
                } catch (e) {
                  setError(String(e));
                  setLoaded(false);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {text("savePermissions")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
