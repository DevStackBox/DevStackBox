/**
 * TerminalToolbar
 *
 * Top-right actions for the active terminal tab.
 * - Clear: clears active tab's scrollback buffer
 * - Kill:  kills the active pty session and removes the tab
 *
 * Split is reserved for v2 (architecture is ready, not built yet).
 */

import { Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface TerminalToolbarProps {
  onClear: () => void;
  onKill: () => void;
  disabled?: boolean;
}

export function TerminalToolbar({
  onClear,
  onKill,
  disabled = false,
}: TerminalToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1">
      {/* Clear */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onClear}
        disabled={disabled}
        title={t("terminal.clearDesc", "Clear terminal")}
        aria-label={t("terminal.clear", "Clear")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {/* Kill */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onKill}
        disabled={disabled}
        title={t("terminal.killDesc", "Kill terminal session")}
        aria-label={t("terminal.kill", "Kill")}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
