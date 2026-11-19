import { useEffect, useState } from "react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Button } from "@/components/ui/button";

/** Startup discovery is read-only. Recovery always requires an explicit restore. */
export function RestoreRecoveryNotice() {
  const [records, setRecords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    safeInvoke<string[]>(TAURI_COMMANDS.backup.listRecovery)
      .then((items) => { if (mounted) setRecords(items ?? []); })
      .catch(() => { if (mounted) setError("Could not check restore recovery records. Check the full backups folder before starting another restore."); });
    return () => { mounted = false; };
  }, []);
  if (!records.length && !error) return null;
  return <aside role="alert" className="mb-4 rounded border border-amber-600 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
    <p className="font-semibold">Restore recovery needs review</p>
    <p>{error ?? `${records.length} retained restore recovery record(s). No restore has been replayed. SQL may have partially applied; wait for MySQL work to finish, inspect the state, then explicitly restore the recovery ZIP named in the record using Settings → Backup.`}</p>
    <Button variant="outline" className="mt-2" onClick={() => {
      void safeInvoke(TAURI_COMMANDS.backup.openFolder).catch(() => setError("Could not open the full backups folder. Check filesystem permissions."));
    }}>Open recovery folder</Button>
  </aside>;
}
