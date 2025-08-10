import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Database, 
  FolderOpen, 
  FileText, 
  Settings, 
  Info,
  Server,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ currentPage, onPageChange, collapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useTranslation();

  const menuItems = [
    {
      id: "dashboard",
      label: t('navigation.dashboard'),
      icon: LayoutDashboard,
      available: true
    },
    {
      id: "services", 
      label: t('navigation.services'),
      icon: Database,
      available: true
    },
    {
      id: "projects",
      label: t('navigation.projects'), 
      icon: FolderOpen,
      available: false
    },
    {
      id: "logs",
      label: t('navigation.logs'),
      icon: FileText,
      available: false
    },
    {
      id: "settings",
      label: t('navigation.settings'),
      icon: Settings,
      available: true
    },
    {
      id: "about",
      label: t('navigation.about'),
      icon: Info,
      available: true
    }
  ];

  return (
    <motion.div
      initial={{ x: -100 }}
      animate={{ x: 0, width: collapsed ? 60 : 240 }}
      transition={{ duration: 0.3 }}
      className="fixed left-0 top-0 h-full bg-card border-r border-border z-50 flex flex-col"
    >
      {/* Header */}
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
              <p className="text-xs text-muted-foreground">v1.0.0</p>
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

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <motion.div
              key={item.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                variant={isActive ? "default" : "ghost"}
                onClick={() => item.available && onPageChange(item.id)}
                disabled={!item.available}
                className={cn(
                  "w-full justify-start relative",
                  collapsed ? "px-2" : "px-3",
                  !item.available && "opacity-50"
                )}
                size={collapsed ? "icon" : "default"}
              >
                <Icon className={cn("h-4 w-4", !collapsed && "mr-2")} />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    {item.label}
                  </motion.span>
                )}
                {!item.available && !collapsed && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {t('common.comingSoon')}
                  </Badge>
                )}
              </Button>
            </motion.div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs text-muted-foreground text-center"
          >
            <p>Built with ❤️</p>
            <p>by Nomad Programmer</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default Sidebar;
