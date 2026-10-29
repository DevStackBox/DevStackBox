/** Session-only cache for stable reads. No timers, disk persistence or cached mutations. */
const policies: Record<string, number> = {
  get_php_versions: 300_000,
  list_php_extensions: 300_000,
  read_config: 60_000,
  list_config_backups: 60_000,
  get_autostart: 60_000,
};
type Entry = { command: string; args?: Record<string, unknown>; expires: number; value?: unknown; pending?: Promise<unknown> };
export class CommandCache {
  private entries = new Map<string, Entry>();
  invalidate(command: string, service?: unknown) {
    for (const [key, entry] of this.entries) {
      if (entry.command === command && (service === undefined || entry.args?.service === service)) this.entries.delete(key);
    }
  }
  async read<T>(command: string, args: Record<string, unknown> | undefined, load: () => Promise<T>, fresh = false): Promise<T> {
    const ttl = policies[command];
    if (!ttl) return load();
    const key = command + JSON.stringify(Object.entries(args ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const existing = this.entries.get(key);
    if (existing?.pending) {
      const value = await existing.pending;
      if (this.entries.get(key) !== existing) return this.read(command, args, load);
      return structuredClone(value) as T;
    }
    if (!fresh && existing && existing.expires > Date.now()) return structuredClone(existing.value) as T;
    if (this.entries.size >= 100) {
      const idle = [...this.entries].find(([, value]) => !value.pending);
      if (idle) this.entries.delete(idle[0]);
      else return load();
    }
    const entry: Entry = { command, args, expires: 0 };
    this.entries.set(key, entry);
    entry.pending = Promise.resolve().then(load);
    try {
      const value = await entry.pending;
      // Reconcile invalidated reads for callers as well as for the cache.
      if (this.entries.get(key) !== entry) return this.read(command, args, load);
      if (this.entries.get(key) === entry) {
        entry.value = structuredClone(value);
        entry.expires = Date.now() + ttl;
        // A failed release check is represented in the response, not a rejected promise.
        if (command === 'get_php_versions' && Array.isArray(value) && value.some(v => v.release_error)) entry.expires = Date.now() + 15_000;
      }
      return structuredClone(value) as T;
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    } finally { entry.pending = undefined; }
  }
  afterMutation(command: string, args?: Record<string, unknown>) {
    if (/^(switch_php_version|download_php_version|restore_full_backup|import_from_xampp)$/.test(command)) {
      for (const read of ['get_php_versions', 'list_php_extensions', 'read_config', 'list_config_backups']) this.invalidate(read);
    }
    if (/^(update_config|restore_config_backup|backup_config|toggle_php_extension|apply_php_recommended_import_limits)$/.test(command)) {
      const service = args?.service ?? 'php';
      this.invalidate('read_config', service);
      this.invalidate('list_config_backups', service);
      if (service === 'php') this.invalidate('list_php_extensions');
    }
    if (command === 'set_autostart') this.invalidate('get_autostart');
  }
}
export const commandCache = new CommandCache();
