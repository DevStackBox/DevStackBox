import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface StatusBadgeProps {
  running: boolean;
  icon?: LucideIcon;
  customLabel?: string;
}

export function StatusBadge({ running, customLabel }: StatusBadgeProps) {
  const { t } = useTranslation();

  return (
    <Badge
      variant={running ? "default" : "secondary"}
      className={`${running ? "bg-green-500 hover:bg-green-600" : "bg-gray-500 hover:bg-gray-600"} transition-colors`}
    >
      <div className="flex items-center gap-1.5">
        {running && (
          <motion.div
            className="h-2 w-2 rounded-full bg-white"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        {customLabel ||
          (running
            ? t("status.running", "Running")
            : t("status.stopped", "Stopped"))}
      </div>
    </Badge>
  );
}
