import { useState, useEffect } from "react";
import { safeInvoke, isTauri, getMockBinariesStatus } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "./components/language-switcher";
import { AutoUpdater } from "./components/auto-updater";
import { Sidebar } from "./components/sidebar";
import { Breadcrumb } from "./components/breadcrumb";
import { OnboardingDialog } from "./components/onboarding-dialog";
import { CommandPalette } from "./components/command-palette";
import { PHPVersionSelector } from "./components/php-version-selector";
import { ConfigEditor } from "./components/config-editor";
import {
  DashboardPage,
  ServicesPage,
  LogsPage,
  DatabasesPage,
  SettingsPage,
  AboutPage,
} from "./pages";
import { Toaster } from "@/components/ui/toaster";
import type { ServiceName } from "@/types/services";
import "./lib/i18n";

function App() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [phpVersionSelectorOpen, setPhpVersionSelectorOpen] = useState(false);
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const [configService, setConfigService] = useState<ServiceName>("mysql");
  // Single source of truth for the Logs page: when the user clicks the
  // "Logs" item from any service card (dashboard or services), we set
  // this and navigate to the Logs page so the matching tab opens.
  const [logsService, setLogsService] = useState<"apache" | "mysql" | "php">(
    "apache",
  );

  const [currentPhpVersion, setCurrentPhpVersion] = useState("8.3");

  // Handler to open config editor for a specific service
  const handleOpenConfig = (service: ServiceName) => {
    setConfigService(service);
    setConfigEditorOpen(true);
  };

  // Handler: jump to the Logs page on the requested service tab.
  const handleViewLogs = (service: "apache" | "mysql" | "php") => {
    setLogsService(service);
    setCurrentPage("logs");
  };

  // Initialize app and check binaries
  useEffect(() => {
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

      const binaries =
        (await safeInvoke<Record<string, boolean>>(
          TAURI_COMMANDS.system.checkBinaries,
        )) || getMockBinariesStatus();
      console.log("Binary status:", binaries);

      if (!binaries.mysql) {
        console.warn("MySQL binary not found at mysql/bin/mysqld.exe");
      }
      if (!binaries.apache) {
        console.warn("Apache binary not found at apache/bin/httpd.exe");
      }
      if (!binaries["php8.3"]) {
        console.warn("PHP 8.3 binary not found at php/8.3/php.exe");
      }

      // Resolve the active PHP branch from the backend so the UI does not
      // hardcode "8.3". `get_php_versions` returns each branch with an
      // `is_active` flag (set by the `php/current` junction). Fall back to
      // the first installed branch, then to the existing default.
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

  // Stub function for command palette - services are now managed by individual pages
  const handleServiceToggle = (service: string) => {
    console.log(`Toggle ${service} service`);
  };

  // Keyboard shortcuts
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

  const renderPage = () => {
    switch (currentPage) {
      case "services":
        return (
          <ServicesPage
            currentPhpVersion={currentPhpVersion}
            onOpenPHPVersionSelector={() => setPhpVersionSelectorOpen(true)}
            onOpenConfig={handleOpenConfig}
            onViewLogs={handleViewLogs}
          />
        );

      case "projects":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t("navigation.projects")}</h2>
            <EmptyState
              icon={FolderOpen}
              title="Project Management Coming Soon"
              description="Create and manage your PHP projects with virtual hosts, SSL certificates, and automatic configuration. This feature is currently under development."
              action={{
                label: "View Roadmap",
                onClick: () =>
                  window.open(
                    "https://github.com/ProgrammerNomad/DevStackBox/blob/main/ROADMAP.md",
                    "_blank",
                  ),
              }}
            />
          </div>
        );

      case "logs":
        return <LogsPage initialService={logsService} />;

      case "databases":
        return <DatabasesPage />;

      case "settings":
        return <SettingsPage />;

      case "about":
        return <AboutPage />;

      default:
        return (
          <DashboardPage
            onOpenPHPVersionSelector={() => setPhpVersionSelectorOpen(true)}
            onPageChange={setCurrentPage}
            onOpenConfig={handleOpenConfig}
            onViewLogs={handleViewLogs}
            currentPhpVersion={currentPhpVersion}
          />
        );
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="devstackbox-ui-theme">
      <div className="min-h-screen bg-background">
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main Content */}
        <div
          className={`transition-all duration-200 ${
            sidebarCollapsed ? "ml-16" : "ml-64"
          }`}
        >
          {/* Top Bar */}
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <Breadcrumb
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />

              <div className="flex items-center gap-2">
                <AutoUpdater />
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="container mx-auto px-4 py-6">{renderPage()}</main>
        </div>

        {/* Command Palette */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onPageChange={setCurrentPage}
          onServiceToggle={handleServiceToggle}
        />

        {/* PHP Version Selector */}
        <PHPVersionSelector
          isOpen={phpVersionSelectorOpen}
          onClose={() => setPhpVersionSelectorOpen(false)}
          currentVersion={currentPhpVersion}
          onVersionChange={setCurrentPhpVersion}
        />

        {/* Config Editor */}
        <ConfigEditor
          isOpen={configEditorOpen}
          onClose={() => setConfigEditorOpen(false)}
          service={configService}
        />

        {/* Toast Notifications */}
        <Toaster />

        {/* First-launch onboarding */}
        <OnboardingDialog onOpenServices={() => setCurrentPage("services")} />
      </div>
    </ThemeProvider>
  );
}

export default App;
