import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";


/** Resolve phpMyAdmin base URL (respects Apache listen port and SSL). */
export async function getPhpMyAdminBaseUrl(): Promise<string> {

  if (!isTauri()) {
    return "http://localhost/phpmyadmin/";
  }
  const url = await safeInvoke<string>(TAURI_COMMANDS.system.getPhpmyadminUrl);
  return url ?? "http://localhost/phpmyadmin/";
}

export async function phpMyAdminUrlForDatabase(dbName: string): Promise<string> {
  const base = await getPhpMyAdminBaseUrl();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}db=${encodeURIComponent(dbName)}`;
}


/** All app-generated localhost links follow the managed Apache configuration. */
export async function openLocalSite(path = "/"): Promise<void> {
  const base = await getPhpMyAdminBaseUrl();
  const { openExternalUrl } = await import("./tauri");
  await openExternalUrl(new URL(path, base).href);
}
