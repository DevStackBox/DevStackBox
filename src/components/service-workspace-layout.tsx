import { NavLink, Outlet } from "react-router-dom";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkspaceTab {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** If true, NavLink uses `end` (only active on exact match). */
  end?: boolean;
}

interface ServiceWorkspaceLayoutProps {
  tabs: WorkspaceTab[];
  /** Optional content rendered above the tab strip (typically the workspace header). */
  header?: React.ReactNode;
}

/**
 * Shared workspace layout: optional header, sticky tab-styled sub-nav
 * (NavLink-driven), then `<Outlet />` for the active sub-route.
 */
export function ServiceWorkspaceLayout({
  tabs,
  header,
}: ServiceWorkspaceLayoutProps) {
  return (
    <div className="space-y-4">
      {header}
      <div className="border-b border-border">
        <nav
          className="flex flex-wrap items-center gap-1"
          aria-label="Workspace sections"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  );
}

export default ServiceWorkspaceLayout;
