/**
 * Sync UI settings (localStorage) to the Rust app-settings.json file so
 * the backend can honor minimize-to-tray on window close.
 */

import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

export const AUTOSTART_APACHE_KEY = "devstackbox.settings.autoStartApache";
export const AUTOSTART_MYSQL_KEY = "devstackbox.settings.autoStartMysql";
export const MINIMIZE_TO_TRAY_KEY = "devstackbox.settings.minimizeToTray";
export const UPDATE_CHANNEL_KEY = "devstackbox.settings.updateChannel";

export interface AppSettingsPayload {
  minimizeToTray: boolean;
  autoStartApache: boolean;
  autoStartMysql: boolean;
  updateChannel: string;
}

export function readAppSettingsFromStorage(): AppSettingsPayload {
  return {
    minimizeToTray: localStorage.getItem(MINIMIZE_TO_TRAY_KEY) !== "false",
    autoStartApache: localStorage.getItem(AUTOSTART_APACHE_KEY) === "true",
    autoStartMysql: localStorage.getItem(AUTOSTART_MYSQL_KEY) === "true",
    updateChannel: localStorage.getItem(UPDATE_CHANNEL_KEY) ?? "stable",
  };
}

export async function syncAppSettingsToBackend(): Promise<void> {
  if (!isTauri()) return;
  await safeInvoke(TAURI_COMMANDS.system.setAppSettings, {
    settings: readAppSettingsFromStorage(),
  });
}

export function getUpdateChannel(): string {
  return localStorage.getItem(UPDATE_CHANNEL_KEY) ?? "stable";
}
