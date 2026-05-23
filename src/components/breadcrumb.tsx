import { Fragment } from "react";
import { ChevronRight, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getBreadcrumbTrail } from "@/lib/routes";

interface BreadcrumbProps {
  className?: string;
}

export function Breadcrumb({ className }: BreadcrumbProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const trail = getBreadcrumbTrail(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center text-sm text-muted-foreground",
        className,
      )}
    >
      {trail.map((node, idx) => {
        const isLast = idx === trail.length - 1;
        const isRoot = node.path === "/";
        const label = t(node.labelKey, node.defaultLabel);
        return (
          <Fragment key={node.path}>
            {idx > 0 && (
              <ChevronRight
                className="mx-1 h-3.5 w-3.5 text-muted-foreground/60"
                aria-hidden="true"
              />
            )}
            {isLast ? (
              <span className="font-medium text-foreground inline-flex items-center gap-1">
                {isRoot && <Home className="h-3.5 w-3.5" />}
                {label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(node.path)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
                  "hover:bg-accent hover:text-foreground",
                )}
              >
                {isRoot && <Home className="h-3.5 w-3.5" />}
                <span>{label}</span>
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
