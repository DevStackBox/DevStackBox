import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTauri, safeInvoke } from "@/lib/tauri";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { workspaceCache } from "@/lib/workspace-cache";
import { useLocation } from "react-router-dom";

export interface DatabaseOperationItem {
  source: string;
  target: string | null;
  status: string;
  bytes: number;
  output: string | null;
  error: string | null;
}
export interface DatabaseOperation {
  id: string;
  kind: string;
  status: string;
  started: number;
  finished: number | null;
  items: DatabaseOperationItem[];
  error: string | null;
}
export interface DatabaseRequest {
  kind: "export" | "backup" | "serverBackup" | "import";
  sources: string[];
  targets: (string | null)[];
  format: "sql" | "gzip" | "zip";
  content: "all" | "structure" | "data";
  destination: string | null;
  reviewed: boolean;
}
export async function databaseInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri())
    throw new Error(
      "This operation requires the native DevStackBox application.",
    );
  return (await safeInvoke<T>(command, args)) as T;
}
interface Value {
  operations: DatabaseOperation[];
  active: boolean;
  error: string | null;
  reload: () => Promise<void>;
  start: (request: DatabaseRequest) => Promise<string>;
  cancel: (id: string) => Promise<void>;
}
const Context = createContext<Value | null>(null);
export function DatabaseOperationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("database-close-blocked", () =>
          toast({ title: t("databaseWorkspace.operationActive") }),
        ),
      )
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [toast, t]);
  const [operations, setOperations] = useState<DatabaseOperation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const location = useLocation();
  const seen = useRef(new Map<string, string>());
  const pending = useRef<Promise<void> | null>(null);
  const reload = useCallback((): Promise<void> => {
    if (!isTauri()) return Promise.resolve();
    if (pending.current) return pending.current;
    pending.current = (async () => {
    try {
      const records = await databaseInvoke<DatabaseOperation[]>(
        "database_operations",
      );
      setOperations(records);
      setError(null);
      let changed = false;
      for (const record of records) {
        const previous = seen.current.get(record.id);
        const finished = !['queued', 'running'].includes(record.status);
        if (record.kind === 'import' && finished && (previous === 'queued' || previous === 'running' || (!previous && record.status === 'interrupted'))) changed = true;
        seen.current.set(record.id, record.status);
      }
      if (changed) workspaceCache.invalidate('db:');
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = null;
    }
    })();
    return pending.current;
  }, []);
  useEffect(() => { if (location.pathname.startsWith('/databases')) void reload(); }, [location.pathname, reload]);
  useEffect(() => {
    void reload();
    const focus = () => { if (document.visibilityState !== 'hidden') void reload(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [reload]);
  const hasActiveJob = operations.some(op => ['queued', 'running'].includes(op.status));
  useEffect(() => {
    if (!hasActiveJob) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let focused = document.hasFocus();
    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && focused && document.visibilityState !== 'hidden') timer = setTimeout(() => { void reload().finally(schedule); }, 1500);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    const onFocus = () => { focused = true; schedule(); };
    const onBlur = () => { focused = false; schedule(); };
    window.addEventListener('focus', onFocus); window.addEventListener('blur', onBlur);
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, [hasActiveJob, reload]);
  const start = async (request: DatabaseRequest) => {
    setStarting(true);
    try {
      const id = await databaseInvoke<string>("start_database_operation", {
        request,
      });
      seen.current.set(id, 'queued');
      await pending.current;
      await reload();
      return id;
    } finally {
      setStarting(false);
    }
  };
  const cancel = async (id: string) => {
    await databaseInvoke("cancel_database_operation", { id });
    await reload();
  };
  const active =
    starting ||
    operations.some((op) => ["queued", "running"].includes(op.status));
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (active) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [active]);
  return (
    <Context.Provider
      value={{ operations, active, error, reload, start, cancel }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDatabaseOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("DatabaseOperationsProvider is missing");
  return value;
}
