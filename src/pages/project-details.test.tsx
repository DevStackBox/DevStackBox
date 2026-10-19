import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailsPage } from "./project-details";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({
  safeInvoke: mocks.invoke,
  isTauri: () => true,
  openExternalUrl: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
const site = {
  id: "project-stable",
  domain: "shop.test",
  project_root: "C:/sites/shop",
  doc_root: "C:/sites/shop/public",
  enabled: true,
  https: true,
  aliases: [],
};
const health = {
  https: {
    verified: true,
    message: "Trusted HTTPS",
    url: "https://shop.test/",
  },
  website_status: 404,
  website_message: "HTTP 404: check the document root",
  folder_message: "This folder is empty",
  configuration_warnings: ["ssl.conf differs from saved sites"],
};

async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/projects/project-stable"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return {
    host,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

describe("project details", () => {
  it("reads the pinned PHP log and keeps Apache results when PHP log reading fails", async () => {
    mocks.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_vhosts") return [{ ...site, php_version: "8.3" }];
      if (command === "get_php_versions") return [{ version: "8.3", installed: true, is_active: true }];
      if (command === "get_project_diagnostics") return health;
      if (command === "get_service_logs") {
        if (args?.service === "apache") return "Apache test error";
        throw new Error("Cannot read PHP log");
      }
    });
    const view = await render();
    const button = Array.from(view.host.querySelectorAll("button")).find(b => b.textContent === "Read / refresh server logs")!;
    await act(async () => button.click());
    expect(mocks.invoke).toHaveBeenCalledWith("get_service_logs", { service: "php", phpVersion: "8.3" });
    expect(view.host.querySelector("pre")?.textContent).toContain("Apache test error");
    expect(view.host.querySelector("pre")?.textContent).toContain("Cannot read PHP log");
    await view.dispose();
  });

  it("offers only installed PHP versions and saves a project choice without switching the global runtime", async () => {
    let selected: string | null = null;
    mocks.invoke.mockImplementation(
      async (command: string, args?: Record<string, unknown>) => {
        if (command === "list_vhosts")
          return [{ ...site, php_version: selected }];
        if (command === "get_php_versions")
          return [
            { version: "8.3", installed: true, is_active: true },
            { version: "8.4", installed: false, is_active: false },
            { version: "8.5", installed: true, is_active: false },
          ];
        if (command === "set_project_php_version") {
          selected = args!.version as string | null;
          return null;
        }
        return health;
      },
    );
    const view = await render();
    const select = view.host.querySelector<HTMLSelectElement>(
      "#project-php-version",
    )!;
    expect([...select.options].map((option) => option.value)).toEqual([
      "",
      "8.3",
      "8.5",
    ]);
    await act(async () => {
      select.value = "8.5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      select
        .closest("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(mocks.invoke).toHaveBeenCalledWith("set_project_php_version", {
      projectId: "project-stable",
      version: "8.5",
    });
    expect(view.host.textContent).toContain("Current setting: PHP 8.5");
    expect(
      mocks.invoke.mock.calls.some(
        ([command]) =>
          command === "switch_php_version" ||
          command === "download_php_version",
      ),
    ).toBe(false);
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      select
        .closest("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(mocks.invoke).toHaveBeenLastCalledWith("get_project_diagnostics", {
      projectId: "project-stable",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("set_project_php_version", {
      projectId: "project-stable",
      version: null,
    });
    await view.dispose();
  });
  it("shows 404 and configuration drift even when HTTPS is trusted", async () => {
    mocks.invoke.mockImplementation(async (command: string) =>
      command === "list_vhosts" ? [site] : health,
    );
    const view = await render();
    expect(view.host.textContent).toContain("Trusted HTTPS");
    expect(view.host.textContent).toContain("HTTP 404");
    expect(view.host.textContent).toContain("This folder is empty");
    expect(view.host.textContent).toContain(
      "ssl.conf differs from saved sites",
    );
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    expect(view.host.querySelector("form")).not.toBeNull();
    await view.dispose();
  });

  it("saves website edits and keeps the stable details route after a rename", async () => {
    let renamed = false;
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_vhosts")
        return [{ ...site, domain: renamed ? "renamed.test" : site.domain }];
      if (command === "add_vhost") {
        renamed = true;
        return null;
      }
      return { ...health, configuration_warnings: [] };
    });
    const view = await render();
    const input =
      view.host.querySelector<HTMLInputElement>("#project-hostname")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "renamed.test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      view.host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(mocks.invoke).toHaveBeenCalledWith(
      "add_vhost",
      expect.objectContaining({
        domain: "renamed.test",
        previousDomain: "shop.test",
        docRoot: site.doc_root,
      }),
    );
    expect(view.host.querySelector("h1")?.textContent).toBe("renamed.test");
    expect(mocks.invoke).toHaveBeenCalledWith("get_project_diagnostics", {
      projectId: "project-stable",
    });
    await view.dispose();
  });

  it("keeps failed changes visible and reports the backend error", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_vhosts") return [site];
      if (command === "add_vhost")
        throw new Error(
          "Apache rejected the configuration. Previous configuration restored.",
        );
      return { ...health, configuration_warnings: [] };
    });
    const view = await render();
    await act(async () =>
      view.host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(view.host.textContent).toContain("Previous configuration restored");
    expect(
      view.host.querySelector<HTMLInputElement>("#project-hostname")?.value,
    ).toBe("shop.test");
    expect(view.host.textContent).not.toContain("Website settings saved");
    await view.dispose();
  });
});
