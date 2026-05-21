import { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  iconColor: string;
  isRunning: boolean;
  compact?: boolean;
  header?: ReactNode;
  children?: ReactNode;
  delay?: number;
  /**
   * Optional shadcn ContextMenuContent element rendered when the user
   * right-clicks the card body. The card itself supplies the
   * ContextMenu + ContextMenuTrigger wrappers.
   */
  contextMenu?: ReactNode;
  /**
   * Selection state for the Services workspace layout (Phase 6.2).
   * When true the card gets a primary ring; clicking the card body
   * fires `onSelect`.
   */
  isSelected?: boolean;
  onSelect?: () => void;
}

export function ServiceCard({
  title,
  description,
  icon: Icon,
  iconColor,
  isRunning,
  compact = false,
  header,
  children,
  delay = 0,
  contextMenu,
  isSelected = false,
  onSelect,
}: ServiceCardProps) {
  const card = (
    <Card
      onClick={onSelect}
      className={cn(
        "w-full transition-shadow",
        onSelect && "cursor-pointer hover:shadow-md",
        isSelected && "ring-2 ring-primary",
      )}
    >
      <CardHeader className={compact ? "pb-3" : ""}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Icon className={`h-5 w-5 ${iconColor}`} />
              {isRunning && (
                <motion.div
                  className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>
            <CardTitle className={compact ? "text-lg" : "text-xl"}>
              {title}
            </CardTitle>
          </div>
          {header}
        </div>
        {!compact && description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {contextMenu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
          {contextMenu}
        </ContextMenu>
      ) : (
        card
      )}
    </motion.div>
  );
}
