import { describe, it, expect, vi, afterEach } from "vitest";
import { CommandCache } from "./command-cache";
afterEach(() => vi.useRealTimers());
describe("stable command reads", () => {
  it("shares PHP reads across tabs and separates extension branches", async () => {
    const cache = new CommandCache(); const read = vi.fn(async () => ["version"]);
    await Promise.all([cache.read("get_php_versions", undefined, read), cache.read("get_php_versions", undefined, read)]);
    await cache.read("get_php_versions", undefined, read);
    expect(read).toHaveBeenCalledTimes(1);
    await cache.read("list_php_extensions", { version: "8.3" }, read);
    await cache.read("list_php_extensions", { version: "8.4" }, read);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("refresh bypasses TTL and expiry checks external changes without timers", async () => {
    vi.useFakeTimers(); const cache = new CommandCache(); const read = vi.fn(async () => "config");
    await cache.read("read_config", {service:"php"}, read);
    await cache.read("read_config", {service:"php"}, read, true);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(read).toHaveBeenCalledTimes(2);
    await cache.read("read_config", {service:"php"}, read);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("invalidates only the affected configuration and reconciles PHP mutations", async () => {
    const cache = new CommandCache(); const read = vi.fn(async () => "config");
    for (const service of ["php", "apache"]) await cache.read("read_config", {service}, read);
    cache.afterMutation("toggle_php_extension", {version:"8.3"});
    await cache.read("read_config", {service:"apache"}, read);
    expect(read).toHaveBeenCalledTimes(2);
    await cache.read("read_config", {service:"php"}, read);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("does not resurrect a response invalidated during a mutation", async () => {
    const cache = new CommandCache(); let finish!: (value: string) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValue("new");
    const pending = cache.read("get_php_versions", undefined, read); await Promise.resolve();
    const joined = cache.read("get_php_versions", undefined, read);
    cache.afterMutation("switch_php_version"); finish("old");
    expect(await pending).toBe("new");
    expect(await joined).toBe("new");
    expect(read).toHaveBeenCalledTimes(2);
    expect(await cache.read("get_php_versions", undefined, read)).toBe("new");
  });
  it("does not cache live status, mutations or rejected requests", async () => {
    const cache = new CommandCache(); const read = vi.fn(async () => true);
    for (const command of ["get_mysql_status", "read_log_chunk", "start_mysql"]) {
      await cache.read(command, undefined, read); await cache.read(command, undefined, read);
    }
    expect(read).toHaveBeenCalledTimes(6);
    const failed = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    await expect(cache.read("get_php_versions", undefined, failed)).rejects.toThrow("offline");
    expect(await cache.read("get_php_versions", undefined, failed)).toEqual([]);
  });
  it("returns independent values so sorting in one view cannot change another", async () => {
    const cache = new CommandCache(); const read = vi.fn(async () => [2,1]);
    const first = await cache.read("get_php_versions", undefined, read); first.sort();
    expect(await cache.read("get_php_versions", undefined, read)).toEqual([2,1]);
  });
});
