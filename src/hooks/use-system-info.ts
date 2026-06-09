/**
 * useSystemInfo
 *
 * Thin hook that returns cached SystemInfo instantly on subsequent visits.
 * PHP versions are kept fresh via the php-version-changed event.
 *
 * Usage:
 *   const { info, loading, hasCache } = useSystemInfo();
 */

import { useEffect, useState } from "react";
import {
  getSystemInfoCached,
  subscribeToPhpRefresh,
  type SystemInfo,
} from "@/lib/system-info-cache";

interface UseSystemInfoResult {
  info: SystemInfo | null;
  /** True while the initial fetch is in flight (no cache exists yet) */
  loading: boolean;
  /** True once at least one successful fetch has completed */
  hasCache: boolean;
  /** True while php_versions is being refreshed in the background */
  phpRefreshing: boolean;
}

export function useSystemInfo(): UseSystemInfoResult {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCache, setHasCache] = useState(false);
  const [phpRefreshing, setPhpRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const data = await getSystemInfoCached();
      if (!cancelled) {
        setInfo(data);
        setHasCache(!!data);
        setLoading(false);
      }
    };

    void load();

    // Subscribe to live PHP version refreshes
    const unsubscribe = subscribeToPhpRefresh((versions) => {
      if (cancelled) return;
      setPhpRefreshing(true);
      setInfo((prev) =>
        prev ? { ...prev, php_versions: versions } : prev,
      );
      // Brief delay so the spinner is visible for at least one frame
      setTimeout(() => {
        if (!cancelled) setPhpRefreshing(false);
      }, 400);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { info, loading, hasCache, phpRefreshing };
}
