import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TAURI_COMMANDS } from "@/lib/commands";

export interface SystemTrayState {
  isHidden: boolean;
  isMinimized: boolean;
  lastAction: string | null;
  error: string | null;
}

export const useSystemTray = () => {
  const [state, setState] = useState<SystemTrayState>({
    isHidden: false,
    isMinimized: false,
    lastAction: null,
    error: null,
  });

  const showMainWindow = useCallback(async () => {
    try {
      await invoke(TAURI_COMMANDS.tray.showMainWindow);
      setState((prev) => ({
        ...prev,
        isHidden: false,
        isMinimized: false,
        lastAction: "show",
        error: null,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to show window";
      setState((prev) => ({ ...prev, error: errorMessage }));
      console.error("Failed to show main window:", error);
    }
  }, []);

  const hideToTray = useCallback(async () => {
    try {
      await invoke(TAURI_COMMANDS.tray.hideToTray);
      setState((prev) => ({
        ...prev,
        isHidden: true,
        isMinimized: true,
        lastAction: "hide",
        error: null,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to hide to tray";
      setState((prev) => ({ ...prev, error: errorMessage }));
      console.error("Failed to hide to tray:", error);
    }
  }, []);

  const quitApp = useCallback(async () => {
    try {
      await invoke(TAURI_COMMANDS.tray.quitApp);
      setState((prev) => ({
        ...prev,
        lastAction: "quit",
        error: null,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to quit application";
      setState((prev) => ({ ...prev, error: errorMessage }));
      console.error("Failed to quit application:", error);
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    state,
    actions: {
      showMainWindow,
      hideToTray,
      quitApp,
      clearError,
    },
  };
};

export default useSystemTray;
