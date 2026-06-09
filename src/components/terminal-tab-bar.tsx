/**
 * TerminalTabBar
 *
 * VS Code-style tab bar for the universal terminal.
 * - Tab chips with × close button
 * - "+ New Terminal ▾" dropdown to pick shell type
 * - Disabled when canCreateTab is false (MAX_TABS reached)
 */

import { X, Plus, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SHELL_TYPES, type ShellType } from "@/lib/shell-types";
import { useTerminal, MAX_TABS } from "@/context/terminal-context";
import { cn } from "@/lib/utils";

export function TerminalTabBar() {
  const { t } = useTranslation();
  const { tabs, activeTabId, canCreateTab, createTab, closeTab, switchTab } =
    useTerminal();

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation(); // don't trigger switchTab
    closeTab(tabId);
  };

  const handleNewTab = (shellType: ShellType) => {
    createTab(shellType);
  };

  const newTabTitle = !canCreateTab
    ? t("terminal.maxTabsReached", `Maximum of ${MAX_TABS} terminal tabs reached`)
    : t("terminal.newTerminal", "New Terminal");

  return (
    <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto shrink-0">
      {/* ── Tab chips ────────────────────────────────────────────────────── */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Icon = tab.shellType.icon;

        return (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            title={tab.title}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-2 text-sm select-none shrink-0",
              "border-r border-border transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isActive
                ? "bg-background text-foreground border-t-2 border-t-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[120px] truncate">{tab.title}</span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => handleClose(e, tab.id)}
              title={`Close ${tab.title}`}
              className={cn(
                "rounded p-0.5 transition-colors",
                "opacity-0 group-hover:opacity-100",
                isActive && "opacity-60",
                "hover:bg-destructive/20 hover:text-destructive hover:!opacity-100",
              )}
              aria-label={`Close ${tab.title}`}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}

      {/* ── New Terminal dropdown ─────────────────────────────────────────── */}
      <div className="px-1 py-1.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
              disabled={!canCreateTab}
              title={newTabTitle}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">
                {t("terminal.newTerminal", "New Terminal")}
              </span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {t("terminal.openShell", "Open shell")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SHELL_TYPES.map((shellType) => {
              const Icon = shellType.icon;
              return (
                <DropdownMenuItem
                  key={shellType.id}
                  onClick={() => handleNewTab(shellType)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {shellType.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
