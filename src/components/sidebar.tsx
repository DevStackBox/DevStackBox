import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { SIDEBAR_ROUTES } from "@/lib/routes";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ x: -100 }}
      animate={{ x: 0, width: collapsed ? 60 : 240 }}
      transition={{ duration: 0.3 }}
      className="fixed left-0 top-0 h-full bg-card border-r border-border z-50 flex flex-col"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-2"
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">DevStackBox</h2>
              <p className="text-xs text-muted-foreground">v{APP_VERSION}</p>
            </div>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {SIDEBAR_ROUTES.map((route) => {
          const Icon = route.icon;
          const label = t(route.labelKey, route.defaultLabel);
          return (
            <motion.div
              key={route.path}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <NavLink
                to={route.path}
                end={route.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center w-full rounded-md text-sm font-medium transition-colors",
                    collapsed
                      ? "h-10 w-10 justify-center"
                      : "h-10 px-3 justify-start",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className={cn("h-4 w-4", !collapsed && "mr-2")} />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    {label}
                  </motion.span>
                )}
              </NavLink>
            </motion.div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs text-muted-foreground text-center"
          >
            <p>Built by Nomad Programmer</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default Sidebar;
