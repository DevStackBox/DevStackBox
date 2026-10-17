import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

let cachedBaseUrl: string | null = null;

/** Resolve phpMyAdmin base URL (respects Apache listen port and SSL). */
export async function getPhpMyAdminBaseUrl(): Promise<string> {

  if (!isTauri()) {
    cachedBaseUrl = "http://localhost/phpmyadmin/";
    return cachedBaseUrl;
  }
  const url = await safeInvoke<string>(TAURI_COMMANDS.system.getPhpmyadminUrl);
  cachedBaseUrl = url ?? "http://localhost/phpmyadmin/";
  return cachedBaseUrl;
}

export async function phpMyAdminUrlForDatabase(dbName: string): Promise<string> {
  const base = await getPhpMyAdminBaseUrl();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}db=${encodeURIComponent(dbName)}`;
}

export function invalidatePhpMyAdminUrlCache(): void {
  cachedBaseUrl = null;
}

/** All app-generated localhost links follow the managed Apache configuration. */
export async function openLocalSite(path = "/"): Promise<void> {
  const base = await getPhpMyAdminBaseUrl();
  const { openExternalUrl } = await import("./tauri");
  await openExternalUrl(new URL(path, base).href);
}
