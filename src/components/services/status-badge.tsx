import type { ServiceState } from "@/types/services";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface StatusBadgeProps {
  running: boolean;
  state?: ServiceState;
  icon?: LucideIcon;
  customLabel?: string;
}

export function StatusBadge({ running, state, customLabel }: StatusBadgeProps) {
  const { t } = useTranslation();

  return (
    <Badge
      variant={running ? "default" : "secondary"}
      className={`${running ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-slate-700 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-slate-200"} transition-colors`}
    >
      <div className="flex items-center gap-1.5">
        {running && (
          <motion.div
            className="h-2 w-2 rounded-full bg-white"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        {customLabel || (state === "starting" ? "Starting…" : state === "stopping" ? "Stopping…" : state === "error" ? "Status unavailable" : null) ||
          (running
            ? t("status.running", "Running")
            : t("status.stopped", "Stopped"))}
      </div>
    </Badge>
  );
}
