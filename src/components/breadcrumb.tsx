import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface BreadcrumbProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  className?: string;
}

const PAGE_LABEL_KEYS: Record<string, string> = {
  dashboard: "navigation.dashboard",
  services: "navigation.services",
  databases: "navigation.databases",
  projects: "navigation.projects",
  logs: "navigation.logs",
  settings: "navigation.settings",
  about: "navigation.about",
};

export function Breadcrumb({
  currentPage,
  onPageChange,
  className,
}: BreadcrumbProps) {
  const { t } = useTranslation();
  const isDashboard = currentPage === "dashboard";
  const labelKey = PAGE_LABEL_KEYS[currentPage] ?? "navigation.dashboard";
  const label = t(labelKey);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center text-sm text-muted-foreground",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onPageChange("dashboard")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
          "hover:bg-accent hover:text-foreground",
          isDashboard && "text-foreground",
        )}
      >
        <Home className="h-3.5 w-3.5" />
        <span>{t("navigation.dashboard")}</span>
      </button>
      {!isDashboard && (
        <>
          <ChevronRight
            className="mx-1 h-3.5 w-3.5 text-muted-foreground/60"
            aria-hidden="true"
          />
          <span className="font-medium text-foreground">{label}</span>
        </>
      )}
    </nav>
  );
}
