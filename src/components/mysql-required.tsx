import type { ReactNode } from "react";
import { useServiceStatus } from "@/context/service-status-context";
import { Button } from "@/components/ui/button";

/** Do not mount live database consumers until this installation's MySQL is ready. */
export function MySQLRequired({ children }: { children: ReactNode }) {
  const { services, initialLoading, loading, toggleService, refresh } = useServiceStatus();
  const state = services.mysql.state;
  if (!initialLoading && state === "running") return <>{children}</>;
  const pending = initialLoading || state === "starting" || state === "stopping";
  return (
    <section role="status" className="rounded-md border bg-card p-6 space-y-3">
      <h2 className="text-base font-semibold">{initialLoading ? "Checking MySQL status…" : state === "starting" ? "Starting MySQL…" : state === "stopping" ? "Stopping MySQL…" : state === "error" ? "Could not check MySQL status" : "MySQL is stopped"}</h2>
      <p className="text-sm text-muted-foreground">Start DevStackBox MySQL to manage databases and users. Your saved databases remain on this computer.</p>
      <div className="flex gap-2">
        <Button disabled={pending || state === "error" || loading !== null} onClick={() => void toggleService("mysql")}>Start MySQL</Button>
        <Button variant="outline" disabled={pending || loading !== null} onClick={() => void refresh()}>Check again</Button>
      </div>
    </section>
  );
}
