import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "./tauri";
import { commandCache } from "./command-cache";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
beforeEach(() => {
  vi.stubGlobal("__TAURI__", {});
  commandCache.afterMutation("restore_full_backup");
  mocks.invoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe("native invocation caching", () => {
  it("reuses tab reads but refresh and version changes reach the backend", async () => {
    mocks.invoke.mockResolvedValue([{ version: "8.3" }]);
    await safeInvoke("get_php_versions");
    await safeInvoke("get_php_versions");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await safeInvoke("get_php_versions", undefined, {fresh: true});
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await safeInvoke("switch_php_version", {version:"8.4"});
    await safeInvoke("get_php_versions");
    expect(mocks.invoke).toHaveBeenCalledTimes(4);
  });
  it("invalidates configuration after a partially failed write", async () => {
    mocks.invoke.mockResolvedValueOnce("old").mockRejectedValueOnce(new Error("partial write")).mockResolvedValueOnce("actual");
    await safeInvoke("read_config", {service:"php"});
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(safeInvoke("update_config", {service:"php", content:"new"})).rejects.toThrow("partial write");
      expect(await safeInvoke("read_config", {service:"php"})).toBe("actual");
    } finally { logging.mockRestore(); }
  });
});
