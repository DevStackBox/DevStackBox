/**
 * DatabaseCacheContext
 *
 * Single source of truth for the MySQL database list.
 * Uses sessionStorage - instant within a session, fresh on app restart.
 *
 * Rules:
 *  - NO auto-poll. refresh() is called explicitly after mutations.
 *  - Lazy warmup - does NOT fetch on app startup.
 *    Data loads only when refresh() is first called by a consumer.
 *  - On a failed refresh the existing state is preserved (never cleared).
 *  - Shared refreshPromiseRef - every `await refresh()` waits for the same
 *    in-flight request (no duplicate MySQL queries).
 *  - hasCache distinguishes "no databases yet" from "still loading first time".
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseInfo {
  name: string;
  tableCount: number;
  sizeBytes: number;
}

interface RawDatabaseInfo {
  name: string;
  table_count: number;
  size_bytes: number;
}

function mapDatabase(raw: RawDatabaseInfo): DatabaseInfo {
  return {
    name: raw.name,
    tableCount: raw.table_count,
    sizeBytes: raw.size_bytes,
  };
}

// ---------------------------------------------------------------------------
// Cache constants
// ---------------------------------------------------------------------------

const DATABASE_CACHE_VERSION = 1;
const DATABASE_CACHE_KEY = "dsb:databases";

interface CachedDatabases {
  version: number;
  timestamp: number;
  lastSuccessfulRefresh: number;
  databases: DatabaseInfo[];
}

function readDatabaseCache(): CachedDatabases | null {
  try {
    const raw = sessionStorage.getItem(DATABASE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CachedDatabases;
    if (cache.version !== DATABASE_CACHE_VERSION) return null;
    return cache;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface DatabaseCacheContextValue {
  databases: DatabaseInfo[];
  /** true while a refresh is in flight */
  loading: boolean;
  /**
   * true once at least one successful fetch has occurred (or session cache existed).
   * Distinguishes "empty list" from "still loading for the first time".
   *
   * | hasCache | loading | databases.length | Correct UI         |
   * |----------|---------|------------------|--------------------|
   * | false    | true    | 0                | Skeleton           |
   * | false    | false   | 0                | Empty state        |
   * | true     | false   | 0                | Empty state (real) |
   * | true     | false   | N                | List immediately   |
   */
  hasCache: boolean;
  /**
   * The ONLY way to (re-)fetch the database list.
   * Call this after: create DB, delete DB, restore backup, import SQL, manual Refresh.
   * Pages must NOT introduce their own local fetch functions.
   */
  refresh: () => Promise<void>;
}

const DatabaseCacheContext = createContext<DatabaseCacheContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DatabaseCacheProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const cached = readDatabaseCache();
  const [databases, setDatabases] = useState<DatabaseInfo[]>(
    cached?.databases ?? [],
  );
  const [loading, setLoading] = useState(false);
  const [hasCache, setHasCache] = useState(!!cached);

  // Shared promise - prevents duplicate in-flight requests
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      setLoading(true);
      try {
        if (!isTauri()) {
          // Browser / dev mode mock
          const mock: DatabaseInfo[] = [
            { name: "sample_db", tableCount: 5, sizeBytes: 1024000 },
            { name: "wordpress", tableCount: 12, sizeBytes: 5242880 },
            { name: "laravel_app", tableCount: 0, sizeBytes: 0 },
          ];
          setDatabases(mock);
          setHasCache(true);
          return;
        }

        const list = await safeInvoke<RawDatabaseInfo[]>(
          TAURI_COMMANDS.services.listMysqlDatabasesDetailed,
        );
        const mapped = (list ?? []).map(mapDatabase);
        setDatabases(mapped);
        setHasCache(true);

        const now = Date.now();
        try {
          sessionStorage.setItem(
            DATABASE_CACHE_KEY,
            JSON.stringify({
              version: DATABASE_CACHE_VERSION,
              timestamp: now,
              lastSuccessfulRefresh: now,
              databases: mapped,
            } satisfies CachedDatabases),
          );
        } catch {
          // sessionStorage quota exceeded - non-fatal
        }
      } catch (err) {
        // RULE: never clear existing databases on failure - keep what was showing.
        console.error("[DatabaseCacheProvider] refresh failed:", err);
        toast({
          variant: "destructive",
          title: "Failed to load databases",
          description: `${err}`,
        });
      } finally {
        setLoading(false);
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [toast]);

  // NO useEffect here - lazy warmup only.
  // Data is fetched when the consumer calls refresh() for the first time.

  return (
    <DatabaseCacheContext.Provider
      value={{ databases, loading, hasCache, refresh }}
    >
      {children}
    </DatabaseCacheContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDatabaseCache(): DatabaseCacheContextValue {
  const ctx = useContext(DatabaseCacheContext);
  if (!ctx) {
    throw new Error(
      "useDatabaseCache must be used inside <DatabaseCacheProvider>",
    );
  }
  return ctx;
}
