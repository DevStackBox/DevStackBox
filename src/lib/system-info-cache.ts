/**
 * system-info-cache.ts
 *
 * Caches the result of the get_system_info Tauri command in localStorage.
 *
 * Cache invalidation rules (exactly three, no TTL):
 *  1. cacheVersion !== APP_VERSION  → full rebuild (app was updated)
 *  2. devstackbox:php-version-changed event  → patch php_versions field only
 *  3. No existing cache  → fetch once and cache it
 *
 * initializeSystemInfoCache() MUST be called once at App startup.
 * Do NOT rely on top-level module side effects for listener registration.
 */

import { APP_VERSION } from "@/lib/version";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemInfo {
  os: string;
  arch: string;
  os_version: string;
  app_version: string;
  tauri_version: string;
  apache_version: string | null;
  mysql_version: string | null;
  php_versions: string[];
}

interface SystemInfoCache {
  /** Matches APP_VERSION. Cache is busted when this differs. */
  cacheVersion: string;
  data: SystemInfo;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = "dsb:system-info";

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

function readCache(): SystemInfoCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SystemInfoCache;
    // Bust cache if app version has changed
    if (parsed.cacheVersion !== APP_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: SystemInfo): void {
  try {
    const entry: SystemInfoCache = { cacheVersion: APP_VERSION, data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded - non-fatal
  }
}

// ---------------------------------------------------------------------------
// Internal: fetch live php_versions and patch the cache
// ---------------------------------------------------------------------------

// Callbacks registered by useSystemInfo to re-render when PHP versions change
const phpRefreshListeners = new Set<(versions: string[]) => void>();

export function subscribeToPhpRefresh(
  cb: (versions: string[]) => void,
): () => void {
  phpRefreshListeners.add(cb);
  return () => phpRefreshListeners.delete(cb);
}

async function refreshPhpVersions(): Promise<void> {
  if (!isTauri()) return;

  try {
    // Re-uses the same command App.tsx already consumes
    const versions = await safeInvoke<
      Array<{ version: string; is_active: boolean; installed: boolean }>
    >(TAURI_COMMANDS.php.getVersions);

    const installed = (versions ?? [])
      .filter((v) => v.installed)
      .map((v) => v.version);

    // Patch the cache - leave all other fields intact
    const cached = readCache();
    if (cached) {
      writeCache({ ...cached.data, php_versions: installed });
    }

    // Notify all active useSystemInfo hooks
    phpRefreshListeners.forEach((cb) => cb(installed));
  } catch (err) {
    console.error("[system-info-cache] refreshPhpVersions failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns cached SystemInfo immediately if the cache is valid,
 * otherwise fetches from Tauri, writes to cache, and returns it.
 */
export async function getSystemInfoCached(): Promise<SystemInfo | null> {
  const cached = readCache();
  if (cached) return cached.data;

  if (!isTauri()) {
    // Browser / dev mode mock
    return {
      os: "browser",
      arch: "n/a",
      os_version: "Browser preview",
      app_version: APP_VERSION,
      tauri_version: "n/a",
      apache_version: null,
      mysql_version: null,
      php_versions: [],
    };
  }

  try {
    const info = await safeInvoke<SystemInfo>(
      TAURI_COMMANDS.system.getSystemInfo,
    );
    if (info) writeCache(info);
    return info ?? null;
  } catch (err) {
    console.error("[system-info-cache] getSystemInfoCached failed:", err);
    return null;
  }
}

/**
 * Register the php-version-changed event listener.
 * Call this ONCE during App startup - NOT as a module-level side effect.
 */
export function initializeSystemInfoCache(): void {
  window.addEventListener(
    "devstackbox:php-version-changed",
    () => void refreshPhpVersions(),
  );
}
