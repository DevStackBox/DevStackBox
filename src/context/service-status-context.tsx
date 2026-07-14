/**
 * ServiceStatusContext
 *
 * Single source of truth for Apache / MySQL / PHP status.
 * Lives at the app root - never unmounts, never stops polling.
 *
 * Rules enforced here:
 *  - "starting" / "stopping" states are NEVER written to localStorage.
 *  - On a failed refresh the existing state is preserved (never cleared).
 *  - Per-service partial failures keep the previous value for that service.
 *  - A shared refreshPromiseRef ensures every `await refresh()` caller
 *    waits for the same in-flight request (not a stale no-op).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { safeInvoke, isTauri, getMockServiceStatus } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import {
  mapRawStatus,
  type RawServiceStatus,
  type ServiceState,
  type ServiceStatus,
} from "@/types/services";
import { notify, primeNotificationPermission } from "@/lib/notify";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// ---------------------------------------------------------------------------
// Cache constants
// ---------------------------------------------------------------------------

const SERVICE_CACHE_VERSION = 1;
const SERVICE_CACHE_KEY = "dsb:service-status";
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours

interface CachedEntry {
  version: number;
  timestamp: number;
  lastSuccessfulRefresh: number;
  services: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  };
}

function readServiceCache(): CachedEntry | null {
  try {
    const raw = localStorage.getItem(SERVICE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CachedEntry;
    if (cache.version !== SERVICE_CACHE_VERSION) return null;
    if (Date.now() - cache.timestamp > MAX_CACHE_AGE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeServiceCache(
  services: { apache: ServiceStatus; mysql: ServiceStatus; php: ServiceStatus },
  now: number,
): void {
  // RULE: only persist "running" or "stopped" - never optimistic states.
  const cacheable = {
    apache: {
      ...services.apache,
      state: services.apache.running ? "running" : ("stopped" as ServiceState),
    },
    mysql: {
      ...services.mysql,
      state: services.mysql.running ? "running" : ("stopped" as ServiceState),
    },
    php: {
      ...services.php,
      state: services.php.running ? "running" : ("stopped" as ServiceState),
    },
  };
  try {
    localStorage.setItem(
      SERVICE_CACHE_KEY,
      JSON.stringify({
        version: SERVICE_CACHE_VERSION,
        timestamp: now,
        lastSuccessfulRefresh: now,
        services: cacheable,
      } satisfies CachedEntry),
    );
  } catch {
    // localStorage quota exceeded - non-fatal
  }
}

// ---------------------------------------------------------------------------
// Default / initial state
// ---------------------------------------------------------------------------

const STOPPED: ServiceStatus = { state: "stopped", running: false };

const defaultServices = { apache: STOPPED, mysql: STOPPED, php: STOPPED };

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface ServiceStatusContextValue {
  services: { apache: ServiceStatus; mysql: ServiceStatus; php: ServiceStatus };
  /** true only on very first app launch with no valid cache */
  initialLoading: boolean;
  /** epoch ms of the last successful poll - null until first poll completes */
  lastSuccessfulRefresh: number | null;
  /** which service is being toggled right now */
  loading: string | null;
  setLoading: (s: string | null) => void;
  /** force immediate re-fetch - awaitable, shared promise (no duplicate fetches) */
  refresh: () => Promise<void>;
  /** instantly update a single service's state for optimistic UI */
  optimisticUpdate: (
    service: "apache" | "mysql" | "php",
    partial: Partial<ServiceStatus>,
  ) => void;
}

const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const cached = readServiceCache();
  const [services, setServices] = useState(cached?.services ?? defaultServices);
  const [initialLoading, setInitialLoading] = useState(!cached);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<
    number | null
  >(cached?.lastSuccessfulRefresh ?? null);
  const [loading, setLoading] = useState<string | null>(null);

  // Ref mirrors loading for crash detection inside the polling closure
  const loadingRef = useRef<string | null>(null);
  loadingRef.current = loading;

  // Track previous running state to detect unexpected crashes
  const prevRunningRef = useRef<Record<string, boolean>>({
    apache: cached?.services.apache.running ?? false,
    mysql: cached?.services.mysql.running ?? false,
    php: cached?.services.php.running ?? false,
  });

  // Ref to keep the latest toggleService for the tray listener
  const toggleServiceRef = useRef<(service: string) => void>(() => {});

  // Shared refresh promise - every `await refresh()` caller waits for the
  // same in-flight request rather than returning immediately (void).
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // Stable services ref so the polling closure can access latest state
  // without stale closure issues inside setServices functional update.
  const servicesRef = useRef(services);
  servicesRef.current = services;

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        if (!isTauri()) {
          // Browser / dev mode - use mock data
          const mock = getMockServiceStatus();
          const mockStatus: ServiceStatus = {
            state: mock.running ? "running" : "stopped",
            running: mock.running,
            pid: mock.pid ?? undefined,
            port: mock.port ?? undefined,
          };
          const next = {
            apache: mockStatus,
            mysql: mockStatus,
            php: mockStatus,
          };
          setServices(next);
          const now = Date.now();
          setLastSuccessfulRefresh(now);
          writeServiceCache(next, now);
          setInitialLoading(false);
          return;
        }

        const [apacheR, mysqlR, phpR] = await Promise.allSettled([
          safeInvoke<RawServiceStatus>(TAURI_COMMANDS.services.getApacheStatus),
          safeInvoke<RawServiceStatus>(TAURI_COMMANDS.services.getMysqlStatus),
          safeInvoke<RawServiceStatus>(TAURI_COMMANDS.services.getPhpStatus),
        ]);

        // RULE: per-service partial failure - keep previous value on failure.
        setServices((prev) => {
          const next = {
            apache:
              apacheR.status === "fulfilled"
                ? mapRawStatus(apacheR.value)
                : prev.apache,
            mysql:
              mysqlR.status === "fulfilled"
                ? mapRawStatus(mysqlR.value)
                : prev.mysql,
            php:
              phpR.status === "fulfilled" ? mapRawStatus(phpR.value) : prev.php,
          };

          // Crash detection: service flipped running→stopped without user action
          (["apache", "mysql", "php"] as const).forEach((name) => {
            const wasRunning = prevRunningRef.current[name];
            const isRunning = next[name].running;
            if (wasRunning && !isRunning && loadingRef.current !== name) {
              const label = name.charAt(0).toUpperCase() + name.slice(1);
              toast({
                variant: "destructive",
                title: `${label} stopped unexpectedly`,
                description: `${label} was running but is no longer responding. Check logs and restart it.`,
                action: (
                  <ToastAction
                    altText="Restart"
                    onClick={() => toggleServiceRef.current(name)}
                  >
                    Restart
                  </ToastAction>
                ),
              });
              void notify(
                `${label} stopped unexpectedly`,
                "Open DevStackBox to view logs and restart the service.",
              );
              void safeInvoke(TAURI_COMMANDS.services.logCrashEvent, {
                service: name,
                timestamp: new Date().toISOString(),
              });
            }
            prevRunningRef.current[name] = isRunning;
          });

          // RULE: only write "running"/"stopped" to cache - not optimistic states.
          const now = Date.now();
          setLastSuccessfulRefresh(now);
          writeServiceCache(next, now);

          return next;
        });

        setInitialLoading(false);
      } catch (err) {
        // RULE: never clear existing state on a complete refresh failure.
        console.error("[ServiceStatusProvider] refresh failed:", err);
        setInitialLoading(false);
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [toast]);

  const optimisticUpdate = useCallback(
    (service: "apache" | "mysql" | "php", partial: Partial<ServiceStatus>) => {
      setServices((prev) => ({
        ...prev,
        [service]: { ...prev[service], ...partial },
      }));
    },
    [],
  );

  // Single polling loop for the entire app lifetime
  useEffect(() => {
    primeNotificationPermission();
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Tray toggle listener - keep toggleServiceRef pointing to the latest handler
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("tray-toggle-service", (event) => {
        toggleServiceRef.current(event.payload);
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Window hidden to tray notification
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("window-hidden-to-tray", () => {
        const SHOWN_KEY = "devstackbox.tray.hideNoticeShown";
        if (!localStorage.getItem(SHOWN_KEY)) {
          localStorage.setItem(SHOWN_KEY, "1");
          void notify(
            "DevStackBox is still running",
            "The app is minimized to the system tray. Click the tray icon to restore it.",
          );
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <ServiceStatusContext.Provider
      value={{
        services,
        initialLoading,
        lastSuccessfulRefresh,
        loading,
        setLoading,
        refresh,
        optimisticUpdate,
      }}
    >
      {children}
    </ServiceStatusContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useServiceStatus(): ServiceStatusContextValue {
  const ctx = useContext(ServiceStatusContext);
  if (!ctx) {
    throw new Error(
      "useServiceStatus must be used inside <ServiceStatusProvider>",
    );
  }
  return ctx;
}
