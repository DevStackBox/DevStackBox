import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../locales/en.json";
import { DatabaseTransferPage } from "./transfer";
const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  start: vi.fn(),
  refresh: vi.fn(),
  state: "running",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce((value: any, part) => value?.[part], en) ?? key,
  }),
}));
vi.mock("@/context/database-cache-context", () => ({
  useDatabaseCache: () => ({
    databases: [{ name: "example", tableCount: 1, sizeBytes: 1024 }],
    refresh: mock.refresh,
  }),
}));
vi.mock("@/context/service-status-context", () => ({
  useServiceStatus: () => ({ services: { mysql: { state: mock.state } } }),
}));
vi.mock("@/context/database-operations-context", () => ({
  databaseInvoke: mock.invoke,
  useDatabaseOperations: () => ({
    operations: [],
    active: false,
    error: null,
    start: mock.start,
    cancel: vi.fn(),
  }),
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.state = "running";
});
async function render(database?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={database ? [{ pathname: "/", state: { tab: "import", database } }] : undefined}>
        <DatabaseTransferPage />
      </MemoryRouter>,
    ),
  );
  return {
    host,
    button: (label: string) =>
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === label,
      )!,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}
describe("database import risk review", () => {
  it.each(["sql-zip", "package"])("uses detected %s kind for target selection", async (kind) => {
    mock.invoke.mockImplementation(async (command: string) => command === "pick_database_files"
      ? ["C:/backup.zip"]
      : [{ file: "C:/backup.zip", kind, size: 32, databases: kind === "package" ? ["original"] : [], engine: [], warning: "Review SQL" }]);
    const view = await render("example");
    await act(async () => view.button("Choose files").click());
    const target = view.host.querySelector('input:not([type="checkbox"])') as HTMLInputElement;
    expect(target.disabled).toBe(kind === "package");
    expect(target.value).toBe(kind === "package" ? "" : "example");
    if (kind === "sql-zip") {
      expect(view.host.textContent).toContain("a full dump may fail if tables already exist");
      expect(view.host.textContent).toContain("Use a new, empty database");
    }
    await view.dispose();
  });
  it("clears a failed review on retry and restores controls", async () => {
    let fail = true;
    mock.invoke.mockImplementation(async (command: string) => {
      if (command === "pick_database_files") return ["C:/backup.zip"];
      if (fail) throw new Error("Invalid archive");
      return [{ file: "C:/backup.zip", kind: "sql-zip", size: 32, databases: [], engine: [], warning: "Review SQL" }];
    });
    const view = await render();
    await act(async () => view.button("Import").click());
    await act(async () => view.button("Choose files").click());
    expect(view.host.textContent).toContain("Invalid archive");
    expect(view.button("Review files").disabled).toBe(false);
    fail = false;
    await act(async () => view.button("Review files").click());
    expect(view.host.textContent).not.toContain("Invalid archive");
    expect(view.host.textContent).not.toContain("Checking files");
    expect(view.button("Choose files").disabled).toBe(false);
    await view.dispose();
  });
  it("requires a successful file review and explicit acknowledgement before native import", async () => {
    mock.invoke.mockImplementation(async (command: string) =>
      command === "pick_database_files"
        ? ["C:/example.sql"]
        : [
            {
              file: "C:/example.sql",
              size: 32,
              databases: [],
              engine: [],
              warning: "SQL scope is not confined",
            },
          ],
    );
    mock.start.mockResolvedValue("job-1");
    const view = await render();
    await act(async () => view.button("Import").click());
    expect(view.button("Start reviewed import").disabled).toBe(true);
    await act(async () => view.button("Choose files").click());
    expect(view.button("Start reviewed import").disabled).toBe(true);
    await act(async () =>
      (
        view.host.querySelector('input[type="checkbox"]') as HTMLInputElement
      ).click(),
    );
    expect(view.button("Start reviewed import").disabled).toBe(false);
    await act(async () => view.button("Start reviewed import").click());
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "import",
        sources: ["C:/example.sql"],
        targets: [null],
        reviewed: true,
      }),
    );
    await view.dispose();
  });
  it("does not enable import when validation fails", async () => {
    mock.invoke.mockImplementation(async (command: string) => {
      if (command === "pick_database_files") return ["C:/broken.zip"];
      throw new Error("Package checksum mismatch");
    });
    const view = await render();
    await act(async () => view.button("Import").click());
    await act(async () => view.button("Choose files").click());
    expect(view.host.textContent).toContain("Package checksum mismatch");
    expect(view.button("Start reviewed import").disabled).toBe(true);
    expect(mock.start).not.toHaveBeenCalled();
    await view.dispose();
  });
  it("keeps import unavailable while MySQL is stopped even after review", async () => {
    mock.state = "stopped";
    const view = await render();
    await act(async () => view.button("Import").click());
    expect(view.button("Start reviewed import").disabled).toBe(true);
    expect(view.host.textContent).toContain("MySQL is not running");
    await view.dispose();
  });
});
