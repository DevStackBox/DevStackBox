/**
 * UniversalTerminalPage  (/terminal)
 *
 * Viewport-only component - renders the tab bar, toolbar, and pane container.
 * All actual session state lives in TerminalProvider (App root) so sessions
 * survive navigation away from this page and back.
 *
 * All TerminalPane instances are rendered here but hidden via CSS when
 * inactive - they are NEVER unmounted while the tab exists.
 */

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { SquareTerminal } from "lucide-react";
import { TerminalTabBar } from "@/components/terminal-tab-bar";
import { TerminalToolbar } from "@/components/terminal-toolbar";
import { TerminalPane } from "@/components/terminal-pane";
import { useTerminal } from "@/context/terminal-context";
import { DEFAULT_SHELL } from "@/lib/shell-types";

// Map from tabId → imperative clear function (provided by TerminalPane via onMount)
type ClearFnMap = Map<string, () => void>;

export function UniversalTerminalPage() {
  const { t } = useTranslation();
  const { tabs, activeTabId, createTab, closeTab } = useTerminal();
  const clearFnsRef = useRef<ClearFnMap>(new Map());

  // ── Toolbar handlers ───────────────────────────────────────────────────

  const handleClear = () => {
    const clearFn = activeTabId ? clearFnsRef.current.get(activeTabId) : null;
    clearFn?.();
  };

  const handleKill = () => {
    if (!activeTabId) return;
    // closeTab triggers TerminalPane unmount → full cleanup in useEffect
    closeTab(activeTabId);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full"
      style={{ minHeight: "calc(100vh - 120px)" }}
    >
      {/* Page heading */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <SquareTerminal className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">
            {t("navigation.terminal", "Terminal")}
          </h1>
        </div>
        <TerminalToolbar
          onClear={handleClear}
          onKill={handleKill}
          disabled={!activeTabId}
        />
      </div>

      {/* Tab bar + pane area */}
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-background">
        {/* Tab bar */}
        <TerminalTabBar />

        {/* Pane container - all panes mounted, only active is visible */}
        <div className="flex-1 min-h-0 relative">
          {tabs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <SquareTerminal className="h-12 w-12 opacity-30" />
              <p className="text-sm">
                {t("terminal.noTabs", "No terminal open")}
              </p>
              <button
                onClick={() => createTab(DEFAULT_SHELL)}
                className="text-sm text-primary hover:underline"
              >
                {t("terminal.openShell", "Open a shell")}
              </button>
            </div>
          ) : (
            tabs.map((tab) => (
              <TerminalPane
                key={tab.id}
                sessionId={tab.id}
                initialCommand={tab.shellType.initialCommand}
                isActive={tab.id === activeTabId}
                onMount={(clearFn) => {
                  clearFnsRef.current.set(tab.id, clearFn);
                  return () => clearFnsRef.current.delete(tab.id);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default UniversalTerminalPage;
