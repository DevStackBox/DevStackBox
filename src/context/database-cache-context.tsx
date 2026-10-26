import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { safeInvoke, isTauri } from '@/lib/tauri';
import { TAURI_COMMANDS } from '@/lib/commands';
import { useServiceStatus } from './service-status-context';
import { useWorkspaceQuery } from '@/hooks/use-workspace-query';
import { workspaceCache } from '@/lib/workspace-cache';
export interface DatabaseInfo { name: string; tableCount: number; viewCount?: number; sizeBytes: number; statsKnown?: boolean; }
interface Raw { name: string; table_count: number; view_count: number; size_bytes: number; }
interface Value {
  databases: DatabaseInfo[]; loading: boolean; hasCache: boolean; error: string | null;
  lastSuccessfulRefresh: number | null; refresh: () => Promise<void>; observe: () => () => void;
}
const Context = createContext<Value | null>(null);
export function DatabaseCacheProvider({ children }: { children: ReactNode }) {
  const { services } = useServiceStatus();
  const [consumers, setConsumers] = useState(0);
  const live = services.mysql.state === 'running';
  const enabled = live && consumers > 0;
  const observe = useCallback(() => { setConsumers(n => n + 1); return () => setConsumers(n => n - 1); }, []);
  const previous = useRef({ port: services.mysql.port, pid: services.mysql.pid, live, apache: services.apache.state });
  useEffect(() => {
    const old = previous.current;
    const next = { port: services.mysql.port, pid: services.mysql.pid, live, apache: services.apache.state };
    if (old.port !== next.port) workspaceCache.invalidate('db:', true);
    else if (old.live !== live || (live && old.pid !== next.pid)) workspaceCache.invalidate('db:');
    if (old.apache !== next.apache) { workspaceCache.invalidate('project:health:'); workspaceCache.invalidate('project:ssl'); }
    previous.current = next;
  }, [services.mysql.port, services.mysql.pid, live, services.apache.state]);
  const names = useWorkspaceQuery<string[]>('db:names', async () => {
    if (!isTauri()) throw new Error('Database information requires the native application.');
    const result = await safeInvoke<string[]>(TAURI_COMMANDS.services.listMysqlDatabases);
    if (!Array.isArray(result)) throw new Error('Invalid database names response');
    return result;
  }, 15000, enabled);
  const stats = useWorkspaceQuery<Raw[]>('db:stats', async () => {
    const result = await safeInvoke<Raw[]>(TAURI_COMMANDS.services.listMysqlDatabasesDetailed);
    if (!Array.isArray(result)) throw new Error('Invalid database metadata response');
    return result;
  }, 60000, enabled);
  const databases = useMemo(() => {
    const byName = new Map((stats.data ?? []).map(row => [row.name, row]));
    return (names.data ?? stats.data?.map(row => row.name) ?? []).map(name => {
      const row = byName.get(name);
      return { name, tableCount: row?.table_count ?? 0, viewCount: row?.view_count ?? 0, sizeBytes: row?.size_bytes ?? 0, statsKnown: !!row };
    });
  }, [names.data, stats.data]);
  const refresh = useCallback(async () => { if (live) await Promise.all([names.refresh(), stats.refresh()]); }, [live, names.refresh, stats.refresh]);
  return <Context.Provider value={{ databases, loading: names.refreshing || stats.refreshing, hasCache: names.data !== undefined || stats.data !== undefined, error: names.error || stats.error, lastSuccessfulRefresh: names.updatedAt ?? stats.updatedAt, refresh, observe }}>{children}</Context.Provider>;
}
export function useDatabaseCache(active = true) {
  const value = useContext(Context);
  if (!value) throw new Error('DatabaseCacheProvider is missing');
  useEffect(() => { if (active) return value.observe(); }, [active, value.observe]);
  return value;
}
