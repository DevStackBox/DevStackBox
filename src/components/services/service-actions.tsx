import { Button } from "@/components/ui/button";
import { Play, Square, ExternalLink, type LucideProps } from "lucide-react";
import type { ServiceAction } from "@/types/services";

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
          aria-label={action.label}
          className="flex items-center justify-center"
        >
          {action.icon}
          {!compact && <span className="ml-2">{action.label}</span>}
        </Button>
      ))}
    </div>
  );
}

export const StartIcon = (props: LucideProps) => <Play className="h-4 w-4" {...props} />;
export const StopIcon = (props: LucideProps) => <Square className="h-4 w-4" {...props} />;
export const OpenIcon = (props: LucideProps) => <ExternalLink className="h-4 w-4" {...props} />;
