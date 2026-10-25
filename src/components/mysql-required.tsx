import type { ReactNode } from "react";
import { useServiceStatus } from "@/context/service-status-context";
import { Button } from "@/components/ui/button";
import { useDatabaseCache } from "@/context/database-cache-context";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/** Do not mount live database consumers until this installation's MySQL is ready. */
export function MySQLRequired({ children }: { children: ReactNode }) {
  const { services, initialLoading, loading, toggleService, refresh } =
    useServiceStatus();
  const { databases, hasCache, lastSuccessfulRefresh } = useDatabaseCache();
  const { t } = useTranslation();
  const state = services.mysql.state;
  if (!initialLoading && state === "running") return <>{children}</>;
  const pending =
    initialLoading || state === "starting" || state === "stopping";
  return (
    <section role="status" className="rounded-md border bg-card p-6 space-y-3">
      <h2 className="text-base font-semibold">
        {initialLoading
          ? "Checking MySQL status…"
          : state === "starting"
            ? "Starting MySQL…"
            : state === "stopping"
              ? "Stopping MySQL…"
              : state === "error"
                ? "Could not check MySQL status"
                : "MySQL is stopped"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Start DevStackBox MySQL to manage databases and users. Your saved
        databases remain on this computer.
      </p>
      <div className="flex gap-2">
        <Button
          disabled={pending || state === "error" || loading !== null}
          onClick={() => void toggleService("mysql")}
        >
          Start MySQL
        </Button>
        <Button
          variant="outline"
          disabled={pending || loading !== null}
          onClick={() => void refresh()}
        >
          Check again
        </Button>
      </div>
      <Link className="text-sm underline" to="/services/mysql/logs">
        {t("databaseWorkspace.viewLogs")}
      </Link>
      {hasCache && (
        <div className="border-t pt-3 space-y-2">
          <p className="text-sm">
            {t("databaseWorkspace.stale")} {t("databaseWorkspace.lastRefresh")}:{" "}
            {lastSuccessfulRefresh
              ? new Date(lastSuccessfulRefresh).toLocaleString()
              : "-"}
          </p>
          <ul className="text-sm font-mono">
            {databases.map((db) => (
              <li key={db.name}>{db.name}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
