import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  Settings,
  Activity,
  ExternalLink,
  Download,
  Copy,
} from "lucide-react";
import { ReactNode } from "react";

interface ServiceAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
  tooltip?: string;
}

interface ServiceActionsProps {
  actions: ServiceAction[];
  loading?: boolean;
  compact?: boolean;
  layout?: "row" | "grid";
}

export function ServiceActions({
  actions,
  loading = false,
  compact = false,
  layout = "grid",
}: ServiceActionsProps) {
  const containerClass =
    layout === "row"
      ? "flex items-center gap-2"
      : "grid grid-cols-1 md:grid-cols-4 gap-2";

  return (
    <div className={containerClass}>
      {actions.map((action, idx) => (
        <Button
          key={idx}
          onClick={action.onClick}
          variant={action.variant || "outline"}
          size={compact ? "sm" : "default"}
          disabled={loading || action.disabled}
          title={action.tooltip}
          className="flex items-center justify-center"
        >
          {action.icon}
          {!compact && <span className="ml-2">{action.label}</span>}
        </Button>
      ))}
    </div>
  );
}

// Icon exports for common service actions
export const StartIcon = <Play className="h-4 w-4" />;
export const StopIcon = <Square className="h-4 w-4" />;
export const ConfigIcon = <Settings className="h-4 w-4" />;
export const LogsIcon = <Activity className="h-4 w-4" />;
export const OpenIcon = <ExternalLink className="h-4 w-4" />;
export const BackupIcon = <Download className="h-4 w-4" />;
export const CopyIcon = <Copy className="h-4 w-4" />;
