import { useWorkspaceQuery } from "@/hooks/use-workspace-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  databaseInvoke,
  useDatabaseOperations,
} from "@/context/database-operations-context";
import { useServiceStatus } from "@/context/service-status-context";
import { formatBytes } from "@/lib/utils";
import { openExternalUrl } from "@/lib/tauri";
import { phpMyAdminUrlForDatabase } from "@/lib/phpmyadmin";

interface Details {
  access: { account: string; scope: string; privilege: string }[];
  name: string;
  charset: string;
  collation: string;
  objects: {
    name: string;
    kind: string;
    engine: string;
    rows: number;
    size: number;
  }[];
}
export function DatabaseDetailsPage() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const text = (key: string) => t(`databaseWorkspace.${key}`);
  const { services } = useServiceStatus();
  const live = services.mysql.state === "running";
  const { active } = useDatabaseOperations();
  const query = useWorkspaceQuery('db:details:' + name, () => databaseInvoke<Details>('database_details', { name }), 30000, live && !active);
  const details = query.data ?? null;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError || query.error;
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const transfer = (tab: string) =>
    navigate("/databases/import-export", {
      state: { tab, sources: tab === "import" ? [] : [name], database: name },
    });
  return (
    <div className="space-y-5">
      <Link className="text-sm underline" to="/databases">
        ← {text("databases")}
      </Link>
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="text-2xl font-semibold break-all mr-auto">{name}</h2>
        <Button disabled={!live || active} onClick={() => transfer("export")}>
          {text("export")}
        </Button>
        <Button
          variant="outline"
          disabled={!live || active}
          onClick={() => transfer("import")}
        >
          {text("import")}
        </Button>
        <Button variant="outline" onClick={() => transfer("backups")}>
          {text("backups")}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!live && <p>{text("offlineTransfers")}</p>}
      <div className="flex gap-2 flex-wrap" role="group">
        {["overview", "tables", "access"].map((key) => (
          <Button
            key={key}
            aria-pressed={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {text(key === "tables" ? "tablesViews" : key)}
          </Button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="rounded-md border bg-card p-5 space-y-3">
          {details ? (
            <>
              <p>
                {text("charset")}: {details.charset} · {text("collation")}:{" "}
                {details.collation}
              </p>
              <p>
                {text("tables")}:{" "}
                {details.objects.filter((o) => o.kind === "BASE TABLE").length}{" "}
                / {text("views")}:{" "}
                {details.objects.filter((o) => o.kind === "VIEW").length}
              </p>
              <p>
                {text("estimatedSize")}:{" "}
                {formatBytes(
                  details.objects.reduce((sum, item) => sum + item.size, 0),
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {text("metadataNote")}
              </p>
            </>
          ) : (
            <p>{text(live ? "loading" : "offlineTransfers")}</p>
          )}
          <Button
            variant="outline"
            onClick={() =>
              void phpMyAdminUrlForDatabase(name)
                .then(openExternalUrl)
                .catch((e) => setError(String(e)))
            }
          >
            phpMyAdmin
          </Button>
        </div>
      )}
      {tab === "tables" && (
        <div className="space-y-3">
          <Input
            aria-label={text("searchObjects")}
            placeholder={text("searchObjects")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {text("metadataNote")}
          </p>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    "name",
                    "type",
                    "engine",
                    "estimatedRows",
                    "estimatedSize",
                  ].map((key) => (
                    <th className="p-3 text-left" key={key}>
                      {text(key === "tables" ? "tablesViews" : key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details?.objects
                  .filter((o) =>
                    o.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((o) => (
                    <tr className="border-t" key={o.name}>
                      <td className="p-3 font-mono">{o.name}</td>
                      <td className="p-3">{o.kind}</td>
                      <td className="p-3">{o.engine || "-"}</td>
                      <td className="p-3">
                        {o.kind === "VIEW" ? "-" : o.rows.toLocaleString()}
                      </td>
                      <td className="p-3">{formatBytes(o.size)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "access" && (
        <div className="rounded-md border p-5 space-y-3">
          <p>{text("grantLimitations")}</p>
          <ul className="divide-y text-sm">
            {details?.access.map((entry, index) => (
              <li className="py-2 flex flex-wrap gap-3" key={index}>
                <span className="font-mono">{entry.account}</span>
                <span>{entry.scope}</span>
                <span>{entry.privilege}</span>
              </li>
            ))}
          </ul>
          <Button
            onClick={() =>
              navigate("/databases/users", { state: { database: name } })
            }
          >
            {text("manageUsers")}
          </Button>
        </div>
      )}
    </div>
  );
}
