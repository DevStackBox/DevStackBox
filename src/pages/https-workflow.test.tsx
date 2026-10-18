import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SslPage } from "./ssl";
import { SitesWorkspace } from "@/components/sites-workspace";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({
  safeInvoke: mocks.invoke,
  isTauri: () => true,
  openExternalUrl: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
afterEach(() => vi.clearAllMocks());
async function render(element: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>));
  return {
    host,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}
describe("local site health", () => {
  it("reports generated configuration drift even with no saved projects", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "get_site_configuration_warnings")
        return ["ssl.conf differs from saved sites"];
      if (command === "get_ssl_status") return { sites: [], ca_trusted: false };
      return [];
    });
    const view = await render(<SitesWorkspace />);
    expect(view.host.textContent).toContain(
      "ssl.conf differs from saved sites",
    );
    expect(view.host.textContent).toContain("Configuration needs review");
    await view.dispose();
  });
  it("does not call configured but untrusted HTTPS ready or allow opening it", async () => {
    mocks.invoke.mockResolvedValue({
      enabled: true,
      ca_exists: true,
      ca_trusted: false,
      port: 443,
      sites: [
        {
          domain: "localhost",
          enabled: true,
          https: true,
          verified: false,
          message: "Windows trust missing",
          expiry: null,
          url: "https://localhost/",
        },
      ],
    });
    const view = await render(<SslPage />);
    expect(view.host.textContent).toContain("HTTPS needs attention");
    const button = [...view.host.querySelectorAll("button")].find(
      (b) => b.textContent === "Open HTTPS site",
    );
    expect(button?.disabled).toBe(true);
    await view.dispose();
  });
  it("shows an unconnected project and an orphan mapping separately", async () => {
    mocks.invoke.mockImplementation(async (command: string) =>
      command === "list_vhosts"
        ? []
        : command === "list_www_projects"
          ? [{ name: "shop", path: "C:/devstackbox/www/shop" }]
          : command === "get_site_configuration_warnings"
            ? []
            : command === "get_hosts_entries"
              ? ["127.0.0.1 old.test"]
              : { sites: [], ca_trusted: false },
    );
    const view = await render(<SitesWorkspace />);
    expect(view.host.textContent).toContain("Connect site");
    expect(view.host.textContent).toContain("old.test");
    expect(view.host.textContent).toContain(
      "Hostname mappings without an active site",
    );
    await view.dispose();
  });
});
