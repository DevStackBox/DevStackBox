/**
 * Route metadata - single source of truth for navigation, breadcrumbs,
 * command palette, and page titles. See TODO Phase 1.
 */
import {
  LayoutDashboard,
  Database,
  FileText,
  Settings,
  Info,
  Server,
  SquareTerminal,
  ShieldAlert,
  Lock,
  Globe,
  HardDriveDownload,
  Users,
  Puzzle,
  FileCog,
  Layers,
  type LucideIcon,
} from "lucide-react";

export interface RouteMeta {
  /** Absolute path, e.g. "/services/apache/ssl". */
  path: string;
  /** i18n key for the label. Falls back to `defaultLabel`. */
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  /** Parent path for breadcrumb chains. */
  parent?: string;
}

export const ROUTES = {
  dashboard: {
    path: "/",
    labelKey: "navigation.dashboard",
    defaultLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  services: {
    path: "/services",
    labelKey: "navigation.services",
    defaultLabel: "Services",
    icon: Server,
  },
  apache: {
    path: "/services/apache",
    labelKey: "navigation.apache",
    defaultLabel: "Apache",
    icon: Server,
    parent: "/services",
  },
  apacheLogs: {
    path: "/services/apache/logs",
    labelKey: "navigation.logs",
    defaultLabel: "Logs",
    icon: FileText,
    parent: "/services/apache",
  },
  apacheConfig: {
    path: "/services/apache/config",
    labelKey: "navigation.config",
    defaultLabel: "Config",
    icon: FileCog,
    parent: "/services/apache",
  },
  apacheVhosts: {
    path: "/services/apache/vhosts",
    labelKey: "navigation.vhosts",
    defaultLabel: "Virtual Hosts",
    icon: Globe,
    parent: "/services/apache",
  },
  apacheSsl: {
    path: "/services/apache/ssl",
    labelKey: "navigation.ssl",
    defaultLabel: "SSL",
    icon: Lock,
    parent: "/services/apache",
  },
  mysql: {
    path: "/services/mysql",
    labelKey: "navigation.mysql",
    defaultLabel: "MySQL",
    icon: Database,
    parent: "/services",
  },
  mysqlLogs: {
    path: "/services/mysql/logs",
    labelKey: "navigation.logs",
    defaultLabel: "Logs",
    icon: FileText,
    parent: "/services/mysql",
  },
  mysqlConfig: {
    path: "/services/mysql/config",
    labelKey: "navigation.config",
    defaultLabel: "Config",
    icon: FileCog,
    parent: "/services/mysql",
  },
  php: {
    path: "/services/php",
    labelKey: "navigation.php",
    defaultLabel: "PHP",
    icon: Server,
    parent: "/services",
  },
  phpExtensions: {
    path: "/services/php/extensions",
    labelKey: "navigation.extensions",
    defaultLabel: "Extensions",
    icon: Puzzle,
    parent: "/services/php",
  },
  phpConfig: {
    path: "/services/php/config",
    labelKey: "navigation.config",
    defaultLabel: "Config",
    icon: FileCog,
    parent: "/services/php",
  },
  phpVersions: {
    path: "/services/php/versions",
    labelKey: "navigation.versions",
    defaultLabel: "Versions",
    icon: Layers,
    parent: "/services/php",
  },
  databases: {
    path: "/databases",
    labelKey: "navigation.databases",
    defaultLabel: "Databases",
    icon: Database,
  },
  databasesUsers: {
    path: "/databases/users",
    labelKey: "navigation.users",
    defaultLabel: "Users",
    icon: Users,
    parent: "/databases",
  },
  databasesBackups: {
    path: "/databases/backups",
    labelKey: "navigation.dbBackups",
    defaultLabel: "Backups",
    icon: HardDriveDownload,
    parent: "/databases",
  },
  logs: {
    path: "/logs",
    labelKey: "navigation.logs",
    defaultLabel: "Logs",
    icon: FileText,
  },
  logsApache: {
    path: "/logs/apache",
    labelKey: "navigation.apache",
    defaultLabel: "Apache",
    icon: Server,
    parent: "/logs",
  },
  logsMysql: {
    path: "/logs/mysql",
    labelKey: "navigation.mysql",
    defaultLabel: "MySQL",
    icon: Database,
    parent: "/logs",
  },
  logsPHP: {
    path: "/logs/php",
    labelKey: "navigation.php",
    defaultLabel: "PHP",
    icon: Server,
    parent: "/logs",
  },
  terminal: {
    path: "/terminal",
    labelKey: "navigation.terminal",
    defaultLabel: "Terminal",
    icon: SquareTerminal,
  },
  security: {
    path: "/security",
    labelKey: "navigation.security",
    defaultLabel: "Security",
    icon: ShieldAlert,
  },
  settings: {
    path: "/settings",
    labelKey: "navigation.settings",
    defaultLabel: "Settings",
    icon: Settings,
  },
  settingsBackup: {
    path: "/settings/backup",
    labelKey: "navigation.backup",
    defaultLabel: "Backup & Restore",
    icon: HardDriveDownload,
    parent: "/settings",
  },
  about: {
    path: "/about",
    labelKey: "navigation.about",
    defaultLabel: "About",
    icon: Info,
  },
} as const satisfies Record<string, RouteMeta>;

/** Sidebar items - the canonical 8 top-level workspaces. */
export const SIDEBAR_ROUTES = [
  ROUTES.dashboard,
  ROUTES.services,
  ROUTES.databases,
  ROUTES.logs,
  ROUTES.terminal,
  ROUTES.security,
  ROUTES.settings,
  ROUTES.about,
] as const;

/** Lookup by path - returns metadata or undefined. */
export function getRouteByPath(path: string): RouteMeta | undefined {
  return Object.values(ROUTES).find((r) => r.path === path);
}

/**
 * Build a breadcrumb chain (root first) for the given path. Walks
 * `parent` pointers. Always includes Dashboard as the root.
 */
export function getBreadcrumbTrail(path: string): RouteMeta[] {
  const trail: RouteMeta[] = [];
  let current: RouteMeta | undefined = matchRouteByPath(path);
  const seen = new Set<string>();
  while (current && !seen.has(current.path)) {
    seen.add(current.path);
    trail.unshift(current);
    current = current.parent ? getRouteByPath(current.parent) : undefined;
  }
  // Ensure Dashboard is always the root unless we are already there.
  if (trail.length === 0 || trail[0].path !== "/") {
    trail.unshift(ROUTES.dashboard);
  }
  return trail;
}

/** Best-effort match: exact, then longest known prefix. */
function matchRouteByPath(path: string): RouteMeta | undefined {
  const direct = getRouteByPath(path);
  if (direct) return direct;
  // Strip trailing segments until a known route matches.
  const segments = path.split("/").filter(Boolean);
  while (segments.length > 0) {
    segments.pop();
    const candidate = "/" + segments.join("/");
    const meta = getRouteByPath(candidate === "/" ? "/" : candidate);
    if (meta) return meta;
  }
  return undefined;
}
