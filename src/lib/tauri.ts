/**
 * Tauri environment detection and safe invoke wrapper
 */
import { commandCache } from "./command-cache";
import { invalidateAfterCommand, revalidateAfterExternalDatabaseTool } from "./workspace-cache";

// Check if we're running in a Tauri environment
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI__" in window;
};

// Open a URL in the system default browser (works in both Tauri and browser)
export const openExternalUrl = async (url: string): Promise<void> => {
  if (new URL(url).pathname.toLowerCase().includes("/phpmyadmin")) revalidateAfterExternalDatabaseTool();
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank");
  }
};

// Safe invoke wrapper that checks for Tauri environment
export const safeInvoke = async <T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { fresh?: boolean },
): Promise<T | null> => {
  if (!isTauri()) {
    console.warn(
      `[Browser Mode] Tauri command '${command}' skipped - not running in Tauri environment`,
    );
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    commandCache.afterMutation(command, args);
    try { return await commandCache.read(command, args, () => invoke<T>(command, args), options?.fresh); }
    finally { commandCache.afterMutation(command, args); invalidateAfterCommand(command); }
  } catch (error) {
    console.error(`[Tauri] Failed to invoke '${command}':`, error);
    throw error;
  }
};

// Get mock data for browser development
export const getMockServiceStatus = () => ({
  running: false,
  port: 0,
  pid: 0,
  uptime: "0s",
});

export const getMockBinariesStatus = () => ({
  mysql: false,
  apache: false,
  "php8.3": false,
});
