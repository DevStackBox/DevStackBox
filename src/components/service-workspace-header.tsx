import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceWorkspaceHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional status badge or summary chip (right side of title). */
  badge?: ReactNode;
  /** Right-aligned action buttons. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Shared workspace header used across all service / databases / settings
 * workspaces. Keeps title, badge, and action placement consistent.
 */
export function ServiceWorkspaceHeader({
  title,
  description,
  badge,
  actions,
  className,
}: ServiceWorkspaceHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-3xl font-bold tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </motion.div>
  );
}

export default ServiceWorkspaceHeader;
