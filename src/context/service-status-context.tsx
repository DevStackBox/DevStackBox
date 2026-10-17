import { listen } from "@tauri-apps/api/event";
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
import { useTranslation } from "react-i18next";
import {
  AUTOSTART_APACHE_KEY,
  AUTOSTART_MYSQL_KEY,
  syncAppSettingsToBackend,
} from "@/lib/app-settings";

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
  runBulk: (action: "start" | "stop" | "restart") => Promise<boolean>;
  /** force immediate re-fetch - awaitable, shared promise (no duplicate fetches) */
  refresh: () => Promise<void>;
  /** instantly update a single service's state for optimistic UI */
  optimisticUpdate: (
    service: "apache" | "mysql" | "php",
    partial: Partial<ServiceStatus>,
  ) => void;
  /** Start/stop a service (same pipeline as service cards). */
  toggleService: (service: string) => Promise<void>;
}

const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [services, setServices] = useState(() => {
    const cached = readServiceCache();
    return cached ? { apache: { ...cached.services.apache, ...STOPPED }, mysql: { ...cached.services.mysql, ...STOPPED }, php: { ...cached.services.php, ...STOPPED } } : defaultServices;
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<
    number | null
  >(null);
  const [loading, updateLoading] = useState<string | null>(null);

  // Ref mirrors loading for crash detection inside the polling closure
  const loadingRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const setLoading = useCallback((value: string | null) => {
    loadingRef.current = value;
    generationRef.current += 1;
    updateLoading(value);
  }, []);

  // Track previous running state to detect unexpected crashes
  // Only live observations can establish a crash baseline; cache is presentation only.
  const prevRunningRef = useRef<Partial<Record<string, boolean>>>({});
  // A stop command can return before Windows has fully reaped every child.
  // Remember the expected stop until a live poll observes it so a delayed
  // process exit cannot be misreported as a crash after the loading UI ends.
  const expectedStopsRef = useRef(new Set<string>());

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

    const generation = generationRef.current;
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

        if (generation !== generationRef.current) return;
        const prev = servicesRef.current;
        const next = {
          apache:
            apacheR.status === "fulfilled" && apacheR.value !== null
              ? mapRawStatus(apacheR.value)
              : prev.apache,
          mysql:
            mysqlR.status === "fulfilled" && mysqlR.value !== null
              ? mapRawStatus(mysqlR.value)
              : prev.mysql,
          php:
            phpR.status === "fulfilled" && phpR.value !== null ? mapRawStatus(phpR.value) : prev.php,
        };

        const results = { apache: apacheR, mysql: mysqlR, php: phpR };
        (["apache", "mysql", "php"] as const).forEach((name) => {
          if (results[name].status !== "fulfilled" || results[name].value == null) {
            if (prevRunningRef.current[name] === undefined || next[name].state === "starting" || next[name].state === "stopping") {
              next[name] = { ...next[name], state: "error" };
            }
            return;
          }
          const wasRunning = prevRunningRef.current[name];
          const isRunning = next[name].running;
          const expectedStop = expectedStopsRef.current.has(name);
          if (wasRunning && !isRunning && !expectedStop && loadingRef.current === null && name !== "php") {
            const label = name === "mysql" ? "MySQL" : "Apache";
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
          if (expectedStop && (!isRunning || loadingRef.current === null)) {
            expectedStopsRef.current.delete(name);
          }
          prevRunningRef.current[name] = isRunning;
        });

        const now = Date.now();
        servicesRef.current = next;
        setServices(next);
        if ([apacheR, mysqlR, phpR].some(result => result.status === "fulfilled" && result.value != null)) {
          setLastSuccessfulRefresh(now);
          writeServiceCache(next, now);
        }

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

  const refreshAfterAction = useCallback(async () => {
    generationRef.current += 1;
    await refreshPromiseRef.current;
    await refresh();
  }, [refresh]);

  const optimisticUpdate = useCallback(
    (service: "apache" | "mysql" | "php", partial: Partial<ServiceStatus>) => {
      const next = { ...servicesRef.current, [service]: { ...servicesRef.current[service], ...partial } };
      servicesRef.current = next;
      setServices(next);
    },
    [],
  );

  const toggleService = useCallback(
    async (service: string) => {
      if (loadingRef.current !== null) return;
      setLoading(service);
      await refreshPromiseRef.current;

      if (!isTauri()) {
        toast({
          variant: "destructive",
          title: t("serviceManager.browserMode", "Browser Mode"),
          description: t(
            "serviceManager.browserModeDesc",
            "Service control requires running in Tauri app",
          ),
        });
        setLoading(null);
        return;
      }

      const key = service as "apache" | "mysql" | "php";
      const isCurrentlyRunning = servicesRef.current[key].running;
      if (isCurrentlyRunning && key !== "php") expectedStopsRef.current.add(key);
      const serviceName = service === "mysql" ? "MySQL" : service === "php" ? "PHP" : "Apache";

      optimisticUpdate(key, {
        state: isCurrentlyRunning ? "stopping" : "starting",
      });

      try {
        let result: boolean | null;
        if (service === "apache") {
          result = await safeInvoke<boolean>(
            TAURI_COMMANDS.services.toggleApache,
          );
        } else if (service === "mysql") {
          result = await safeInvoke<boolean>(
            TAURI_COMMANDS.services.toggleMysql,
          );
        } else {
          result = await safeInvoke<boolean>(TAURI_COMMANDS.services.togglePhp);
        }

        if (result === null) {
          await refreshAfterAction();
          return;
        }

        await refreshAfterAction();
        void safeInvoke(TAURI_COMMANDS.tray.refreshMenu);

        toast({
          variant: "success",
          title: result
            ? t("serviceManager.serviceStarted", "{{service}} Started", {
                service: serviceName,
              })
            : t("serviceManager.serviceStopped", "{{service}} Stopped", {
                service: serviceName,
              }),
        });
      } catch (error) {
        console.error(`Failed to toggle ${service}:`, error);
        await refreshAfterAction();
        toast({
          variant: "destructive",
          title: t("serviceManager.serviceError", "Service Error"),
          description: String(error),
        });
      } finally {
        setLoading(null);
      }
    },
    [optimisticUpdate, refreshAfterAction, setLoading, t, toast],
  );

  const runBulk = useCallback(async (action: "start" | "stop" | "restart") => {
    if (loadingRef.current !== null || !isTauri()) return false;
    if (action !== "start") {
      expectedStopsRef.current.add("apache");
      expectedStopsRef.current.add("mysql");
    }
    setLoading("all");
    await refreshPromiseRef.current;
    for (const name of ["apache", "mysql"] as const) {
      optimisticUpdate(name, { state: action === "stop" ? "stopping" : "starting" });
    }
    try {
      const commands = { start: TAURI_COMMANDS.system.startAllServices, stop: TAURI_COMMANDS.system.stopAllServices, restart: TAURI_COMMANDS.system.restartAllServices };
      await safeInvoke(commands[action]);
      return true;
    } catch (error) {
      toast({ variant: "destructive", title: `Could not ${action} all services`, description: String(error) });
      return false;
    } finally {
      await refreshAfterAction();
      setLoading(null);
    }
  }, [optimisticUpdate, refreshAfterAction, setLoading, toast]);

  toggleServiceRef.current = toggleService;

  // Auto-start services when enabled in settings (once per app launch).
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void syncAppSettingsToBackend();
    void (async () => {
      const startMysql =
        localStorage.getItem(AUTOSTART_MYSQL_KEY) === "true";
      const startApache =
        localStorage.getItem(AUTOSTART_APACHE_KEY) === "true";
      if (!startMysql && !startApache) return;
      setLoading("all");
      await refreshPromiseRef.current;
      try {
        if (startMysql) {
          await safeInvoke(TAURI_COMMANDS.services.startMysql);
        }
        if (startApache) {
          await safeInvoke(TAURI_COMMANDS.services.startApache);
        }
        if (!cancelled) await refreshAfterAction();
      } catch (err) {
        console.warn("[ServiceStatusProvider] auto-start failed:", err);
        if (!cancelled) await refreshAfterAction();
      } finally {
        setLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAfterAction, setLoading]);

  // Poll when visible; tray emits service-status-snapshot every 5s.
  useEffect(() => {
    primeNotificationPermission();
    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && loadingRef.current === null) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const id = setInterval(() => {
      if (document.visibilityState === "visible" && loadingRef.current === null) void refresh();
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      unlisten = await listen("service-status-snapshot", () => {
        // Treat the tray event as invalidation, not a second independent source of state.
        if (loadingRef.current === null) void refresh();
      });
      if (disposed) unlisten?.();
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [refresh]);

  // Tray menu actions still emit tray-services-updated after toggles.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      unlisten = await listen<string>("tray-service-action", (event) => {
        if (event.payload === "complete") {
          void refreshAfterAction().finally(() => setLoading(null));
        } else {
          const service = event.payload as "apache" | "mysql";
          if (servicesRef.current[service]?.running) expectedStopsRef.current.add(service);
          setLoading(event.payload);
        }
      });
      if (disposed) unlisten?.();
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [refreshAfterAction, setLoading]);

  // Window hidden to tray notification
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
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
      if (disposed) unlisten?.();
    })();
    return () => {
      disposed = true;
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
        runBulk,
        refresh,
        optimisticUpdate,
        toggleService,
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
