import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { LogViewer, classifyLine } from "./services/log-viewer";
import { BulkServiceActions } from "./services/bulk-service-actions";
import { ErrorBoundary } from "./error-boundary";
import { WorkspaceConfigEditor } from "@/pages/services/_shared/workspace-config-editor";
const mocks = vi.hoisted(() => ({ toast: vi.fn(), runBulk: vi.fn(), invoke: vi.fn(), t: (key: string, fallback?: string) => fallback ?? key, services: { apache: { state: "running", running: true }, mysql: { state: "running", running: true } } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/context/service-status-context", () => ({ useServiceStatus: () => ({ services: mocks.services, initialLoading: false, loading: null, runBulk: mocks.runBulk }) }));
vi.mock("@/lib/tauri", () => ({ safeInvoke: mocks.invoke }));
vi.mock("@/lib/editor", () => ({}));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@monaco-editor/react", () => ({ default: ({ options }: { options: { readOnly: boolean } }) => <textarea readOnly={options.readOnly} /> }));
let root: Root; let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); mocks.toast.mockClear(); mocks.invoke.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("audit regressions", () => {
  it("distinguishes actual Apache and MySQL severities", () => {
    expect(classifyLine("[core:alert] .htaccess not allowed")).toBe("text-red-400");
    expect(classifyLine("[ssl:warn] certificate")).toBe("text-amber-400");
    expect(classifyLine("[ERROR] [MY-123] failed")).toBe("text-red-400");
    expect(classifyLine("[mpm_winnt:notice] ready")).toBe("text-sky-300");
  });
  it("reports clipboard success and rejection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await act(async () => root.render(<LogViewer logs="sample" title="Apache" />));
    const button = host.querySelector<HTMLButtonElement>('button[title="Copy to clipboard"]')!;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("sample");
    expect(mocks.toast).toHaveBeenLastCalledWith({ title: "audit.logsCopied" });
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => button.click());
    expect(mocks.toast).toHaveBeenLastCalledWith({ title: "audit.copyFailed", variant: "destructive" });
  });
  it("disables Start All when both services are running", async () => {
    await act(async () => root.render(<BulkServiceActions restart />));
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.find(b => b.textContent === "Start All")?.disabled).toBe(true);
    expect(buttons.find(b => b.textContent === "Stop All")?.disabled).toBe(false);
  });
  it("recovers the error boundary after navigation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never { throw new Error("failed"); }
    await act(async () => root.render(<ErrorBoundary resetKey="/broken"><Broken /></ErrorBoundary>));
    expect(host.textContent).toContain("audit.errorTitle");
    await act(async () => root.render(<ErrorBoundary resetKey="/"><p>Dashboard recovered</p></ErrorBoundary>));
    expect(host.textContent).toBe("Dashboard recovered");
  });
  it("blocks configuration editing during load and after a read failure", async () => {
    let reject!: (error: Error) => void;
    mocks.invoke.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await act(async () => root.render(<WorkspaceConfigEditor service="apache" title="Apache" filename="httpd.conf" />));
    expect(host.textContent).toContain("audit.configLoading");
    expect(host.querySelector('textarea')?.readOnly).toBe(true);
    await act(async () => reject(new Error("cannot read")));
    expect(host.textContent).toContain("audit.configFailed");
    expect(host.querySelector('textarea')?.readOnly).toBe(true);
    expect([...host.querySelectorAll('button')].find(b => b.textContent === "Save")?.disabled).toBe(true);
  });
});
