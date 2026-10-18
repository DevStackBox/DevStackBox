import { useState, useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { safeInvoke, isTauri, getMockBinariesStatus } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Menu } from "lucide-react";
import { ProjectsPage } from "./pages/projects";
import { ProjectDetailsPage } from "./pages/project-details";
import { RootPasswordPrompt } from "./components/root-password-prompt";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "./components/language-switcher";
import { AutoUpdater } from "./components/auto-updater";
import { Sidebar } from "./components/sidebar";
import { Breadcrumb } from "./components/breadcrumb";
import { OnboardingDialog } from "./components/onboarding-dialog";
import { ErrorBoundary } from "./components/error-boundary";
import { CommandPalette } from "./components/command-palette";
import { Button } from "@/components/ui/button";
import { ServiceStatusProvider, useServiceStatus } from "./context/service-status-context";
import { DatabaseCacheProvider } from "./context/database-cache-context";
import { UpdaterProvider } from "./context/updater-context";
import { initializeSystemInfoCache } from "./lib/system-info-cache";

import {
  DashboardPage,
  ServicesPage,
  LogsLayout,
  LogsApachePage,
  LogsMysqlPage,
  LogsPhpPage,
  AboutPage,
  SecurityPage,
} from "./pages";
import { UniversalTerminalPage } from "./pages/terminal/index";
import { TerminalProvider } from "./context/terminal-context";
import { ApacheLayout } from "./pages/services/apache/layout";
import { ApacheOverviewPage } from "./pages/services/apache";
import { ApacheLogsPage } from "./pages/services/apache/logs";
import { ApacheConfigPage } from "./pages/services/apache/config";
import { ApacheVhostsPage } from "./pages/services/apache/vhosts";
import { ApacheSslPage } from "./pages/services/apache/ssl";
import { MysqlLayout } from "./pages/services/mysql/layout";
import { MysqlOverviewPage } from "./pages/services/mysql";
import { MysqlLogsPage } from "./pages/services/mysql/logs";
import { MySqlConfigPage } from "./pages/services/mysql/config";
import { PhpLayout } from "./pages/services/php/layout";
import { PhpOverviewPage } from "./pages/services/php";
import { PhpExtensionsPage } from "./pages/services/php/extensions";
import { PhpConfigPage } from "./pages/services/php/config";
import { PhpVersionsPage } from "./pages/services/php/versions";
import { DatabasesLayout } from "./pages/databases/layout";
import { DatabasesPage as DatabasesIndexPage } from "./pages/databases";
import { MySQLUsersPage as DatabasesUsersPage } from "./pages/databases/users";
import { DatabasesBackupsPage } from "./pages/databases/backups";
import { SettingsLayout } from "./pages/settings/layout";
import { SettingsPage as SettingsIndexPage } from "./pages/settings";
import { BackupPage as SettingsBackupPage } from "./pages/settings/backup";
import { SettingsXamppImportPage } from "./pages/settings/xampp-import";
import { Toaster } from "@/components/ui/toaster";
import type { ServiceName } from "@/types/services";
import { ROUTES } from "@/lib/routes";
import { syncAppSettingsToBackend } from "@/lib/app-settings";
import "./lib/i18n";

function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [terminalVisited, setTerminalVisited] = useState(false);
  useEffect(() => { if (location.pathname === "/terminal") setTerminalVisited(true); }, [location.pathname]);
  const { toggleService } = useServiceStatus();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [currentPhpVersion, setCurrentPhpVersion] = useState("8.3");

  const handleOpenConfig = (service: ServiceName) => {
    if (service === "apache") navigate(ROUTES.apacheConfig.path);
    else if (service === "php") navigate(ROUTES.phpConfig.path);
    else navigate(ROUTES.mysqlConfig.path);
  };

  const handleViewLogs = (service: "apache" | "mysql" | "php") => {
    if (service === "apache") navigate(ROUTES.logsApache.path);
    else if (service === "mysql") navigate(ROUTES.logsMysql.path);
    else navigate(ROUTES.logsPHP.path);
  };

  useEffect(() => {
    // Register PHP version change listener for the system info cache.
    // Must be called here - not as a module-level side effect.
    initializeSystemInfoCache();
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (!isTauri()) {
        console.log(
          "[Browser Mode] Running in browser - Tauri features disabled",
        );
        return;
      }
      await syncAppSettingsToBackend();
      const binaries =
        (await safeInvoke<Record<string, boolean>>(
          TAURI_COMMANDS.system.checkBinaries,
        )) || getMockBinariesStatus();
      console.log("Binary status:", binaries);

      try {
        const versions = await safeInvoke<
          Array<{ version: string; is_active: boolean; installed: boolean }>
        >(TAURI_COMMANDS.php.getVersions);
        if (versions && versions.length > 0) {
          const active = versions.find((v) => v.is_active);
          const firstInstalled = versions.find((v) => v.installed);
          const next = active?.version ?? firstInstalled?.version;
          if (next) setCurrentPhpVersion(next);
        }
      } catch (err) {
        console.warn("Failed to resolve active PHP version:", err);
      }
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  };

  const handleServiceToggle = (service: string) => {
    void toggleService(service);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keep currentPhpVersion in sync when the user activates a version from
  // the Versions page. The page dispatches this event after a successful
  // switch so service card badges update without an app restart.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ version: string }>).detail;
      setCurrentPhpVersion(detail.version);
    };
    window.addEventListener("devstackbox:php-version-changed", handler);
    return () =>
      window.removeEventListener("devstackbox:php-version-changed", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <div className={`${mobileNavOpen ? "block" : "hidden"} md:block`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </div>

      <div
        className={`transition-all duration-200 ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden shrink-0"
                aria-label={t("navigation.openMenu", "Open menu")}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Breadcrumb />
            </div>
            <div className="flex items-center gap-2">
              <AutoUpdater mode="indicator" />
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-4">
          <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <DashboardPage
                  onOpenPHPVersionSelector={() =>
                    navigate(ROUTES.phpVersions.path)
                  }
                  onOpenConfig={handleOpenConfig}
                  onViewLogs={handleViewLogs}
                  currentPhpVersion={currentPhpVersion}
                />
              }
            />
            <Route
              path="/services"
              element={
                <ServicesPage
                  currentPhpVersion={currentPhpVersion}
                  onOpenPHPVersionSelector={() =>
                    navigate(ROUTES.phpVersions.path)
                  }
                  onOpenConfig={handleOpenConfig}
                  onViewLogs={handleViewLogs}
                />
              }
            />

            <Route path="/services/apache" element={<ApacheLayout />}>
              <Route index element={<ApacheOverviewPage />} />
              <Route path="logs" element={<ApacheLogsPage />} />
              <Route path="config" element={<ApacheConfigPage />} />
              <Route path="vhosts" element={<ApacheVhostsPage />} />
              <Route path="ssl" element={<ApacheSslPage />} />
            </Route>

            <Route path="/services/mysql" element={<MysqlLayout />}>
              <Route index element={<MysqlOverviewPage />} />
              <Route path="logs" element={<MysqlLogsPage />} />
              <Route path="config" element={<MySqlConfigPage />} />
            </Route>

            <Route path="/services/php" element={<PhpLayout />}>
              <Route index element={<PhpOverviewPage />} />
              <Route path="extensions" element={<PhpExtensionsPage />} />
              <Route path="config" element={<PhpConfigPage />} />
              <Route path="versions" element={<PhpVersionsPage />} />
            </Route>

            <Route path="/databases" element={<DatabasesLayout />}>
              <Route index element={<DatabasesIndexPage />} />
              <Route path="users" element={<DatabasesUsersPage />} />
              <Route path="backups" element={<DatabasesBackupsPage />} />
            </Route>

            <Route path="/logs" element={<LogsLayout />}>
              <Route index element={<Navigate to="apache" replace />} />
              <Route path="apache" element={<LogsApachePage />} />
              <Route path="mysql" element={<LogsMysqlPage />} />
              <Route path="php" element={<LogsPhpPage />} />
            </Route>
            {/* Universal terminal - single route, sessions survive navigation */}
            <Route path="/terminal" element={null} />
            {/* Redirects from old sub-routes */}
            <Route
              path="/terminal/shell"
              element={<Navigate to="/terminal" replace />}
            />
            <Route
              path="/terminal/powershell"
              element={<Navigate to="/terminal" replace />}
            />
            <Route
              path="/terminal/cmd"
              element={<Navigate to="/terminal" replace />}
            />
            <Route
              path="/terminal/php-cli"
              element={<Navigate to="/terminal" replace />}
            />
            <Route
              path="/terminal/mysql-cli"
              element={<Navigate to="/terminal" replace />}
            />
            <Route
              path="/terminal/git"
              element={<Navigate to="/terminal" replace />}
            />
            <Route path="/security" element={<SecurityPage />} />

            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsIndexPage />} />
              <Route path="backup" element={<SettingsBackupPage />} />
              <Route path="xampp-import" element={<SettingsXamppImportPage />} />
            </Route>

            <Route path="/about" element={<AboutPage />} />

            {/* Legacy redirects from the old flat sidebar */}
            <Route
              path="/mysql-users"
              element={<Navigate to={ROUTES.databasesUsers.path} replace />}
            />
            <Route
              path="/ssl"
              element={<Navigate to={ROUTES.apacheSsl.path} replace />}
            />
            <Route
              path="/vhosts"
              element={<Navigate to={ROUTES.apacheVhosts.path} replace />}
            />
            <Route
              path="/backup"
              element={<Navigate to={ROUTES.settingsBackup.path} replace />}
            />
            <Route path={ROUTES.projects.path} element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {terminalVisited && <div hidden={location.pathname !== "/terminal"}><UniversalTerminalPage /></div>}
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onServiceToggle={handleServiceToggle}
      />

      <Toaster />

      <OnboardingDialog
        onOpenServices={() => navigate(ROUTES.services.path)}
        activePhpVersion={currentPhpVersion}
      />
      <RootPasswordPrompt />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="devstackbox-ui-theme">
      <HashRouter>
        <ServiceStatusProvider>
          <DatabaseCacheProvider>
            <UpdaterProvider>
              <TerminalProvider>
                <AppShell />
              </TerminalProvider>
            </UpdaterProvider>
          </DatabaseCacheProvider>
        </ServiceStatusProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
