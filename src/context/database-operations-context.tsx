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
import { useDatabaseCache } from "./database-cache-context";

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
  const { refresh } = useDatabaseCache();
  const previouslyActive = useRef(false);
  const fetching = useRef(false);
  const reload = useCallback(async () => {
    if (!isTauri() || fetching.current) return;
    fetching.current = true;
    try {
      const records = await databaseInvoke<DatabaseOperation[]>(
        "database_operations",
      );
      const active = records.some((op) =>
        ["queued", "running"].includes(op.status),
      );
      setOperations(records);
      setError(null);
      if (previouslyActive.current && !active) void refresh();
      previouslyActive.current = active;
    } catch (e) {
      setError(String(e));
    } finally {
      fetching.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 1500);
    return () => clearInterval(timer);
  }, [reload]);
  const start = async (request: DatabaseRequest) => {
    setStarting(true);
    try {
      const id = await databaseInvoke<string>("start_database_operation", {
        request,
      });
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
