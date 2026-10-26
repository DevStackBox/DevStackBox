export interface CacheSnapshot<T> {
  data: T | undefined;
  updatedAt: number | null;
  refreshing: boolean;
  error: string | null;
  stale: boolean;
}
type Observer = { load: () => Promise<unknown>; ttl: number; poll: boolean };
type Entry = {
  snapshot: CacheSnapshot<unknown>;
  revision: number;
  pending?: Promise<void>;
  observers: Map<symbol, Observer>;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setTimeout>;
  failures: number;
  retryAt: number;
};

/** Session-only cache. One request and one completion-based timer per resource. */
export class WorkspaceCache {
  private entries = new Map<string, Entry>();
  private visible = true;
  reset() {
    for (const entry of this.entries.values()) { clearTimeout(entry.timer); entry.revision++; entry.observers.clear(); }
    this.entries.clear();
  }
  entry(key: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 200) {
        const unused = [...this.entries].find(([, value]) => !value.pending && !value.observers.size && !value.listeners.size);
        if (unused) this.entries.delete(unused[0]);
      }
      entry = { snapshot: { data: undefined, updatedAt: null, refreshing: false, error: null, stale: true }, revision: 0, observers: new Map(), listeners: new Set(), failures: 0, retryAt: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }
  snapshot<T>(key: string) { return this.entry(key).snapshot as CacheSnapshot<T>; }
  setData<T>(key: string, data: T) {
    const entry = this.entry(key); entry.revision++; entry.failures = 0; entry.retryAt = 0;
    this.publish(entry, { data, updatedAt: Date.now(), error: null, stale: false });
    this.schedule(key);
  }
  subscribe(key: string, listener: () => void) {
    const entry = this.entry(key); entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }
  private publish(entry: Entry, update: Partial<CacheSnapshot<unknown>>) {
    entry.snapshot = { ...entry.snapshot, ...update };
    entry.listeners.forEach(listener => listener());
  }
  private schedule(key: string) {
    const entry = this.entry(key);
    clearTimeout(entry.timer); entry.timer = undefined;
    if (!this.visible || entry.pending || !entry.observers.size) return;
    const observers = [...entry.observers.values()];
    if (!observers.some(observer => observer.poll)) return;
    const ttl = Math.min(...observers.map(observer => observer.ttl));
    const due = Math.max(entry.retryAt, (entry.snapshot.updatedAt ?? Date.now()) + ttl);
    entry.timer = setTimeout(() => { void this.ensure(key, observers[0].load, ttl); }, Math.max(100, due - Date.now()));
  }
  observe(key: string, observer: Observer) {
    const entry = this.entry(key); const id = Symbol();
    entry.observers.set(id, observer);
    if (this.visible) void this.ensure(key, observer.load, observer.ttl);
    this.schedule(key);
    return () => { entry.observers.delete(id); this.schedule(key); };
  }
  async ensure(key: string, load: () => Promise<unknown>, ttl: number, force = false): Promise<void> {
    const entry = this.entry(key);
    if (entry.pending) {
      await entry.pending;
      if (force && entry.snapshot.stale && !entry.snapshot.error) await this.ensure(key, load, ttl, true);
      return;
    }
    if (!force && (Date.now() < entry.retryAt || (!entry.snapshot.stale && entry.snapshot.updatedAt !== null && Date.now() - entry.snapshot.updatedAt < ttl))) return;
    const revision = entry.revision;
    this.publish(entry, { refreshing: true, error: null });
    const pending = Promise.resolve().then(load).then(data => {
      if (entry.revision !== revision) return;
      entry.failures = 0; entry.retryAt = 0;
      this.publish(entry, { data, updatedAt: Date.now(), error: null, stale: false });
    }).catch(error => {
      if (entry.revision !== revision) return;
      entry.failures++;
      entry.retryAt = Date.now() + Math.min(300000, Math.max(ttl, 5000) * 2 ** Math.min(entry.failures - 1, 4));
      const sensitiveAuthFailure = (key === 'db:users' || key.startsWith('db:details:')) && /access denied|authentication|1045/i.test(String(error));
      this.publish(entry, { error: String(error), stale: true, ...(sensitiveAuthFailure ? { data: undefined, updatedAt: null } : {}) });
    }).finally(() => {
      entry.pending = undefined;
      this.publish(entry, { refreshing: false });
      const observer = entry.observers.values().next().value as Observer | undefined;
      if (entry.revision !== revision && observer && this.visible) void this.ensure(key, observer.load, observer.ttl, true);
      else this.schedule(key);
    });
    entry.pending = pending;
    await pending;
    if (force && entry.snapshot.stale && !entry.snapshot.error) await this.ensure(key, load, ttl, true);
  }
  invalidate(prefix: string, clear = false) {
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      entry.revision++; entry.retryAt = 0;
      this.publish(entry, { stale: true, ...(clear ? { data: undefined, updatedAt: null, error: null } : {}) });
      const observer = entry.observers.values().next().value as Observer | undefined;
      if (observer && this.visible) queueMicrotask(() => {
        if (entry.observers.size) void this.ensure(key, observer.load, observer.ttl);
      });
    }
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    for (const [key, entry] of this.entries) {
      const observer = entry.observers.values().next().value as Observer | undefined;
      if (visible && observer) void this.ensure(key, observer.load, observer.ttl);
      this.schedule(key);
    }
  }
}

export const workspaceCache = new WorkspaceCache();
let returningFromDatabaseTool = false;
export function revalidateAfterExternalDatabaseTool() { returningFromDatabaseTool = true; }
if (typeof window !== "undefined") {
  const resume = () => {
    const visible = document.visibilityState !== "hidden";
    if (visible && returningFromDatabaseTool) { returningFromDatabaseTool = false; workspaceCache.invalidate("db:"); }
    workspaceCache.setVisible(visible);
  };
  window.addEventListener("focus", resume);
  window.addEventListener("blur", () => workspaceCache.setVisible(false));
  document.addEventListener("visibilitychange", resume);
  resume();
}

/** Mutation invalidation is shared by all callers, including legacy screens. */
export function invalidateAfterCommand(command: string) {
  if (/^(create_mysql_database|drop_mysql_database|restore_mysql_from_file|import_from_xampp|restore_full_backup)$/.test(command)) workspaceCache.invalidate("db:");
  if (/^(create_mysql_user|drop_mysql_user|set_mysql_user_password|set_database_grants)$/.test(command)) { workspaceCache.invalidate("db:users"); workspaceCache.invalidate("db:details:"); }
  if (/^(set_mysql_user_password|update_config|restore_config_backup|set_app_settings)$/.test(command)) workspaceCache.invalidate("db:", true);
  if (/^(add_vhost|remove_vhost|toggle_vhost|set_project_php_version|update_hosts_entry|create_project|create_www_project|enable_ssl|disable_ssl|trust_ssl_ca|generate_ssl_cert|update_config|restore_config_backup|switch_php_version|download_php_version|restore_full_backup|import_from_xampp)/.test(command)) workspaceCache.invalidate("project:");
}
