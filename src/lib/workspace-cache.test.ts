import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCache } from "./workspace-cache";

let cache: WorkspaceCache;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); cache = new WorkspaceCache(); });
afterEach(() => { cache.reset(); vi.useRealTimers(); });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe("workspace cache lifecycle", () => {
  it("does not let a late read overwrite an explicit clear-view cursor", async () => {
    let finish!: (value: string) => void;
    const read = () => new Promise<string>(resolve => { finish = resolve; });
    const pending = cache.ensure('logs:apache', read, 2000);
    await flush(); cache.setData('logs:apache', 'cleared'); finish('old entries'); await pending;
    expect(cache.snapshot('logs:apache').data).toBe('cleared');
  });
  it("waits for the reconciled result when a forced refresh joins an invalidated read", async () => {
    let finish!: (value: string[]) => void;
    let reconcile!: (value: string[]) => void;
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise<string[]>(resolve => { finish = resolve; }))
      .mockImplementationOnce(() => new Promise<string[]>(resolve => { reconcile = resolve; }));
    const stop = cache.observe('list', { load: read, ttl: 15000, poll: false });
    await flush();
    cache.invalidate('list');
    let returned = false;
    const refreshed = cache.ensure('list', read, 15000, true).then(() => { returned = true; });
    finish(['old']); await flush();
    expect(returned).toBe(false);
    reconcile(['new']); await refreshed;
    expect(cache.snapshot('list').data).toEqual(['new']);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
  });
  it("deduplicates concurrent readers and caches a successful empty result", async () => {
    let finish!: (value: string[]) => void;
    const read = vi.fn(() => new Promise<string[]>(resolve => { finish = resolve; }));
    const a = cache.ensure('list', read, 15000);
    const b = cache.ensure('list', read, 15000);
    await flush(); expect(read).toHaveBeenCalledTimes(1);
    finish([]); await Promise.all([a, b]);
    await cache.ensure('list', read, 15000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cache.snapshot('list').data).toEqual([]);
  });
  it("never resurrects an invalidated result and reconciles once", async () => {
    let finish!: (value: string[]) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<string[]>(resolve => { finish = resolve; })).mockResolvedValue(['new']);
    const stop = cache.observe('list', { load: read, ttl: 15000, poll: true });
    await flush(); cache.invalidate('list'); cache.invalidate('list');
    finish(['deleted']); await flush();
    expect(cache.snapshot('list').data).toEqual(['new']);
    expect(read).toHaveBeenCalledTimes(2); stop();
  });
  it("keeps last good data and backs off after a failed background read", async () => {
    const read = vi.fn().mockResolvedValueOnce(['saved']).mockRejectedValue(new Error('offline'));
    const stop = cache.observe('list', { load: read, ttl: 15000, poll: true });
    await flush(); await vi.advanceTimersByTimeAsync(15000);
    expect(cache.snapshot('list').data).toEqual(['saved']);
    expect(cache.snapshot('list').error).toContain('offline');
    cache.setVisible(true); cache.setVisible(true); await flush();
    expect(read).toHaveBeenCalledTimes(2); stop();
  });
  it("uses one timer and pauses with no consumer or a hidden window", async () => {
    const read = vi.fn().mockResolvedValue(['a']);
    const a = cache.observe('list', { load: read, ttl: 15000, poll: true });
    const b = cache.observe('list', { load: read, ttl: 15000, poll: true });
    await flush(); expect(vi.getTimerCount()).toBe(1);
    cache.setVisible(false); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000); expect(read).toHaveBeenCalledTimes(1);
    cache.setVisible(true); await flush(); expect(read).toHaveBeenCalledTimes(2);
    a(); b(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000); expect(read).toHaveBeenCalledTimes(2);
  });
  it("clears identity-scoped data and rejects the old connection response", async () => {
    let finish!: (value: string[]) => void;
    const read = () => new Promise<string[]>(resolve => { finish = resolve; });
    const pending = cache.ensure('db:users', read, 30000);
    await flush(); cache.invalidate('db:', true); finish(['old-user']); await pending;
    expect(cache.snapshot('db:users').data).toBeUndefined();
  });
  it("does not install a polling timer for expensive manual/focus checks", async () => {
    const read = vi.fn().mockResolvedValue('health');
    const stop = cache.observe('health', { load: read, ttl: 60000, poll: false });
    await flush(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60001); expect(read).toHaveBeenCalledTimes(1);
    cache.setVisible(true); await flush(); expect(read).toHaveBeenCalledTimes(2); stop();
  });
});
