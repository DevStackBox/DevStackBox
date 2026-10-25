import { MemoryRouter } from "react-router-dom";
import en from "../../locales/en.json";
import { DatabaseCacheProvider } from "./database-cache-context";
import { DatabasesPage } from "@/pages/databases-list";
import { MySQLUsersPage } from "@/pages/mysql-users";
import { DatabasesBackupsPage } from "@/pages/databases/backups";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ServiceStatusProvider, useServiceStatus } from "./service-status-context";
import { MySQLRequired } from "@/components/mysql-required";
import { TAURI_COMMANDS as C } from "@/lib/commands";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), handlers: new Map<string, (e: { payload: unknown }) => void>() }));
vi.mock("./database-operations-context", () => ({ useDatabaseOperations: () => ({ active: false, start: vi.fn() }), databaseInvoke: mocks.invoke }));
vi.mock("@/lib/tauri", () => ({ isTauri: () => true, safeInvoke: mocks.invoke }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), primeNotificationPermission: vi.fn() }));
vi.mock("@/lib/app-settings", () => ({ syncAppSettingsToBackend: vi.fn(), AUTOSTART_APACHE_KEY: "autoApache", AUTOSTART_MYSQL_KEY: "autoMysql" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key.split(".").reduce((obj: any, segment) => obj?.[segment], en) ?? key }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async (name: string, cb: (e: { payload: unknown }) => void) => { mocks.handlers.set(name, cb); return () => mocks.handlers.delete(name); } }));

let api: ReturnType<typeof useServiceStatus>;
let running = false;
let host: HTMLDivElement;
let root: Root;
const query = vi.fn();
function Consumer() { useEffect(() => { query(); }, []); return <div>Live databases</div>; }
function Harness() { api = useServiceStatus(); return <MySQLRequired><Consumer /></MySQLRequired>; }
async function mount() { await act(async () => root.render(<MemoryRouter><ServiceStatusProvider><DatabaseCacheProvider><Harness /></DatabaseCacheProvider></ServiceStatusProvider></MemoryRouter>)); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); sessionStorage.clear(); mocks.toast.mockClear(); query.mockClear(); mocks.handlers.clear(); running = false;
  mocks.invoke.mockReset().mockImplementation(async (command: string) => {
    if ([C.services.getMysqlStatus, C.services.getApacheStatus, C.services.getPhpStatus].includes(command as never)) return { running };
    if (command === C.system.startAllServices || command === C.services.toggleMysql) running = !running;
    if (command === C.system.stopAllServices) running = false;
    return running;
  });
  host = document.createElement("div"); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe("service availability and crash regression cases", () => {
  it("does not query databases when stopped; Start MySQL mounts them when ready", async () => {
    await mount();
    expect(host.textContent).toContain("MySQL is stopped"); expect(query).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toContain("Live databases"); expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls.some(([v]) => v.title.includes("unexpectedly"))).toBe(false);
  });
  it("does not infer a crash from a previous launch's running cache", async () => {
    const status = { running: true, state: "running" };
    localStorage.setItem("dsb:service-status", JSON.stringify({ version: 1, timestamp: Date.now(), services: { apache: status, mysql: status, php: status } }));
    await mount();
    expect(query).not.toHaveBeenCalled(); expect(host.textContent).toContain("MySQL is stopped"); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("Start All followed by Stop All updates immediately without crash notifications", async () => {
    await mount();
    await act(async () => api.runBulk("start")); expect(api.services.mysql.running).toBe(true);
    await act(async () => api.runBulk("stop")); expect(api.services.mysql.running).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled(); expect(host.textContent).toContain("MySQL is stopped");
  });
  it("suppresses a deliberate stop when Windows reports process exit after Stop All returns", async () => {
    running = true;
    await mount();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === C.system.stopAllServices) return true;
      if ([C.services.getMysqlStatus, C.services.getApacheStatus, C.services.getPhpStatus].includes(command as never)) return { running };
      return true;
    });

    await act(async () => api.runBulk("stop"));
    expect(api.services.apache.running).toBe(true);
    running = false;
    await act(async () => api.refresh());
    expect(api.services.apache.running).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();

    running = true;
    await act(async () => api.refresh());
    running = false;
    await act(async () => api.refresh());
    expect(mocks.toast.mock.calls.filter(([value]) => value.title === "Apache stopped unexpectedly")).toHaveLength(1);
  });
  it("reports a real unexpected stop once, using the MySQL product name", async () => {
    running = true; await mount(); running = false;
    await act(async () => api.refresh()); await act(async () => api.refresh());
    expect(mocks.toast.mock.calls.filter(([v]) => v.title === "MySQL stopped unexpectedly")).toHaveLength(1);
    expect(mocks.toast.mock.calls.filter(([v]) => v.title === "PHP stopped unexpectedly")).toHaveLength(0);
  });
  it("keeps the live status on a failed poll", async () => {
    running = true; await mount(); mocks.invoke.mockRejectedValue(new Error("IPC unavailable"));
    await act(async () => api.refresh());
    expect(api.services.mysql.running).toBe(true); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not treat a tray stop as a crash", async () => {
    running = true; await mount();
    await act(async () => { mocks.handlers.get("tray-service-action")!({ payload: "mysql" }); running = false; });
    await act(async () => mocks.handlers.get("tray-service-action")!({ payload: "complete" }));
    expect(api.services.mysql.running).toBe(false); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("keeps database pages closed while startup is pending and ignores tray snapshots", async () => {
    await mount();
    let finish!: () => void;
    const original = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === C.system.startAllServices) { await new Promise<void>(resolve => { finish = resolve; }); running = true; return true; }
      return original(command);
    });
    let operation!: Promise<boolean>;
    await act(async () => { operation = api.runBulk("start"); });
    expect(host.textContent).toContain("Starting MySQL"); expect(query).not.toHaveBeenCalled();
    const calls = mocks.invoke.mock.calls.length;
    await act(async () => mocks.handlers.get("service-status-snapshot")!({ payload: {} }));
    expect(mocks.invoke.mock.calls.length).toBe(calls);
    await act(async () => { finish(); await operation; });
    expect(host.textContent).toContain("Live databases"); expect(query).toHaveBeenCalledTimes(1);
  });
  it("does not permit duplicate bulk actions while one is pending", async () => {
    await mount();
    let finish!: () => void;
    const original = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === C.system.startAllServices) { await new Promise<void>(resolve => { finish = resolve; }); running = true; return true; }
      return original(command);
    });
    let operation!: Promise<boolean>;
    await act(async () => { operation = api.runBulk("start"); });
    await act(async () => api.runBulk("stop"));
    expect(mocks.invoke.mock.calls.filter(([command]) => command === C.system.stopAllServices)).toHaveLength(0);
    await act(async () => { finish(); await operation; });
  });

  it("reports a Start All failure and returns to the stopped state", async () => {
    await mount();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === C.system.startAllServices) throw new Error("Port 3306 is already in use");
      return { running: false };
    });
    await act(async () => api.runBulk("start"));
    expect(api.loading).toBe(null); expect(host.textContent).toContain("MySQL is stopped");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not start all services", description: expect.stringContaining("3306") }));
  });
});


describe("database screen regression cases", () => {
  it.each([DatabasesPage, MySQLUsersPage, DatabasesBackupsPage])("does not query MySQL or show failure toasts when visiting %s with MySQL stopped", async (Page) => {
    await act(async () => root.render(<MemoryRouter><ServiceStatusProvider><DatabaseCacheProvider><Page /></DatabaseCacheProvider></ServiceStatusProvider></MemoryRouter>));
    expect(host.textContent).toContain("MySQL is stopped");
    expect(host.textContent).not.toContain("No databases match");
    expect(host.textContent).not.toContain("No users found");
    expect(mocks.invoke.mock.calls.some(([command]) => [C.services.listMysqlDatabasesDetailed, C.services.listMysqlUsers].includes(command))).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("distinguishes a successfully loaded empty database list from a failed search", async () => {
    running = true;
    mocks.invoke.mockImplementation(async (command: string) => command === C.services.listMysqlDatabasesDetailed ? [] : { running: true });
    await act(async () => root.render(<MemoryRouter><ServiceStatusProvider><DatabaseCacheProvider><DatabasesPage /></DatabaseCacheProvider></ServiceStatusProvider></MemoryRouter>));
    expect(host.textContent).toContain("No user databases yet. Select Create");
    expect(host.textContent).not.toContain("No databases match your search");
  });
  it("shows connection failures inline with retry rather than claiming there are zero databases", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === C.services.listMysqlDatabasesDetailed) throw new Error("Access denied");
      return { running: true };
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => root.render(<MemoryRouter><ServiceStatusProvider><DatabaseCacheProvider><DatabasesPage /></DatabaseCacheProvider></ServiceStatusProvider></MemoryRouter>));
    expect(host.textContent).toContain("Access denied"); expect(host.textContent).toContain("Try again");
    expect(host.textContent).not.toContain("0 user databases"); expect(mocks.toast).not.toHaveBeenCalled();
    mocks.invoke.mockResolvedValue([]);
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toContain("No user databases yet"); log.mockRestore();
  });
});
