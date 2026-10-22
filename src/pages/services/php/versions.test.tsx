import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhpVersionsPage } from "./versions";
import "@/lib/i18n";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ safeInvoke: mocks.invoke, isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
afterEach(() => vi.clearAllMocks());

async function render(versions: object[]) {
  mocks.invoke.mockImplementation(async (command: string) => command === "get_php_versions" ? versions : true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__TAURI_INTERNALS__", { transformCallback: () => 1, invoke: async () => 1 });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<PhpVersionsPage />));
  return { host, dispose: async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); } };
}

describe("PHP version manager", () => {
  it("shows branch and measured patch separately and updates an active outdated runtime", async () => {
    const view = await render([{ version: "8.3", installed: true, is_active: true, installed_version: "8.3.31", latest_version: "8.3.36", update_available: true, security_update_required: true }]);
    expect(view.host.textContent).toContain("PHP 8.3");
    expect(view.host.textContent).toContain("8.3.31");
    expect(view.host.textContent).toContain("Security update required");
    const update = [...view.host.querySelectorAll("button")].find(b => b.textContent?.includes("Update to 8.3.36"))!;
    await act(async () => update.click());
    expect(mocks.invoke).toHaveBeenCalledWith("download_php_version", { version: "8.3" });
    await view.dispose();
  });
  it("hides PHP 8.1 and keeps installed versions visible when offline", async () => {
    const view = await render([
      { version: "8.1", installed: false, end_of_life: true },
      { version: "8.5", installed: true, installed_version: "8.5.11", security_update_required: true, release_error: "offline" },
    ]);
    expect(view.host.textContent).not.toContain("PHP 8.1");
    expect(view.host.textContent).toContain("8.5.11");
    expect(view.host.textContent).toContain("Refresh to retry");
    expect([...view.host.querySelectorAll("button")].find(b => b.textContent === "Unsupported")).toBeUndefined();
    expect([...view.host.querySelectorAll("button")].find(b => b.textContent === "Update required")?.disabled).toBe(true);
    await view.dispose();
  });
  it("shows the resolved downloadable patch and passes the branch to installation", async () => {
    const view = await render([{ version: "8.5", installed: false, latest_version: "8.5.12" }]);
    const download = [...view.host.querySelectorAll("button")].find(b => b.textContent?.includes("Download 8.5.12"))!;
    await act(async () => download.click());
    expect(mocks.invoke).toHaveBeenCalledWith("download_php_version", { version: "8.5" });
    await view.dispose();
  });
});
