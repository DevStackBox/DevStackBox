import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useServiceStatus } from "./service-status-context";
export interface DatabaseInfo {
  name: string;
  tableCount: number;
  viewCount?: number;
  sizeBytes: number;
}
interface Raw {
  name: string;
  table_count: number;
  view_count: number;
  size_bytes: number;
}
interface Value {
  databases: DatabaseInfo[];
  loading: boolean;
  hasCache: boolean;
  error: string | null;
  lastSuccessfulRefresh: number | null;
  refresh: () => Promise<void>;
}
const Context = createContext<Value | null>(null);
export function DatabaseCacheProvider({ children }: { children: ReactNode }) {
  const { services } = useServiceStatus();
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<
    number | null
  >(null);
  const generation = useRef(0);
  // Memory-only cache never restores another app/data profile. New refreshes supersede older responses.
  useEffect(() => {
    generation.current++;
    setDatabases([]);
    setHasCache(false);
    setLastSuccessfulRefresh(null);
    setLoading(false);
  }, [services.mysql.port]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      if (!isTauri())
        throw new Error(
          "Database information requires the native DevStackBox application.",
        );
      const raw = await safeInvoke<Raw[]>(
        TAURI_COMMANDS.services.listMysqlDatabasesDetailed,
      );
      if (request !== generation.current) return;
      if (!Array.isArray(raw))
        throw new Error("Invalid database metadata response");
      setDatabases(
        raw.map((row) => ({
          name: row.name,
          tableCount: row.table_count,
          viewCount: row.view_count,
          sizeBytes: row.size_bytes,
        })),
      );
      setHasCache(true);
      setLastSuccessfulRefresh(Date.now());
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  return (
    <Context.Provider
      value={{
        databases,
        loading,
        hasCache,
        error,
        lastSuccessfulRefresh,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDatabaseCache() {
  const value = useContext(Context);
  if (!value) throw new Error("DatabaseCacheProvider is missing");
  return value;
}
