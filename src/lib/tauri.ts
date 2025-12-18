/**
 * Tauri environment detection and safe invoke wrapper
 */

// Check if we're running in a Tauri environment
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// Safe invoke wrapper that checks for Tauri environment
export const safeInvoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T | null> => {
  if (!isTauri()) {
    console.warn(`[Browser Mode] Tauri command '${command}' skipped - not running in Tauri environment`);
    return null;
  }
  
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
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
  uptime: '0s',
});

export const getMockBinariesStatus = () => ({
  mysql: false,
  apache: false,
  'php8.2': false,
});
