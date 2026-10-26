import { useWorkspaceQuery } from './use-workspace-query';
import { workspaceCache } from '@/lib/workspace-cache';
import { safeInvoke, isTauri } from '@/lib/tauri';

export interface LogCursor { identity: string; offset: number; prefix: string; prefix_len: number; }
export interface LogChunk { text: string; cursor: LogCursor | null; path: string; size: number; missing: boolean; reset: boolean; skipped: boolean; }
export interface LogStream extends LogChunk { logs: string; idle: number; cleared: boolean; }
export function appendLogChunk(previous: LogStream | undefined, chunk: LogChunk): LogStream {
  const logs = ((chunk.reset || chunk.skipped ? '' : previous?.logs ?? '') + chunk.text).slice(-512 * 1024).split('\n').slice(-1000).join('\n');
  return { ...chunk, logs, idle: chunk.text ? 0 : (previous?.idle ?? 0) + 1, cleared: previous?.cleared ?? false };
}
export function useLogStream(id: string, auto: boolean, enabled: boolean) {
  const key = 'logs:' + id;
  const old = workspaceCache.snapshot<LogStream>(key).data;
  const query = useWorkspaceQuery(key, async () => {
    if (!isTauri()) throw new Error('Log management requires the desktop app.');
    const previous = workspaceCache.snapshot<LogStream>(key).data;
    const chunk = await safeInvoke<LogChunk>('read_log_chunk', { id, cursor: previous?.cursor ?? null, clear: false });
    if (!chunk) throw new Error('No log response');
    return appendLogChunk(previous, chunk);
  }, old && old.idle >= 3 ? 10000 : 2000, enabled, auto);
  const clearView = async () => {
    const chunk = await safeInvoke<LogChunk>('read_log_chunk', { id, cursor: null, clear: true });
    if (chunk) workspaceCache.setData<LogStream>(key, { ...chunk, logs: '', idle: 0, cleared: true });
  };
  const history = async () => {
    const chunk = await safeInvoke<LogChunk>('read_log_chunk', { id, cursor: null, clear: false });
    if (chunk) workspaceCache.setData<LogStream>(key, { ...chunk, logs: chunk.text, idle: 0, cleared: false });
  };
  return { ...query, clearView, history };
}
