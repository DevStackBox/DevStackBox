import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { workspaceCache } from "@/lib/workspace-cache";

export function useWorkspaceQuery<T>(key: string, load: () => Promise<T>, ttl: number, enabled = true, poll = true) {
  const loader = useRef(load); loader.current = load;
  const stableLoad = useCallback(() => loader.current(), [key]);
  const subscribe = useCallback((listener: () => void) => workspaceCache.subscribe(key, listener), [key]);
  const getSnapshot = useCallback(() => workspaceCache.snapshot<T>(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (enabled) return workspaceCache.observe(key, { load: stableLoad, ttl, poll });
  }, [key, ttl, enabled, poll, stableLoad]);
  const refresh = useCallback(async () => {
    if (enabled) await workspaceCache.ensure(key, stableLoad, ttl, true);
  }, [key, stableLoad, ttl, enabled]);
  return { ...snapshot, refresh };
}
