import { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

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
}: ServiceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="w-full">
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
    </motion.div>
  );
}
