import { useState, useEffect } from "react";
import { safeInvoke, isTauri, getMockBinariesStatus } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Server, FolderOpen, Info, Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "./components/language-switcher";
import { AutoUpdater } from "./components/auto-updater";
import { Sidebar } from "./components/sidebar";
import { Breadcrumb } from "./components/breadcrumb";
import { OnboardingDialog } from "./components/onboarding-dialog";
import { BugReportDialog } from "./components/bug-report-dialog";
import { CommandPalette } from "./components/command-palette";
import { PHPVersionSelector } from "./components/php-version-selector";
import { ConfigEditor } from "./components/config-editor";
import { DashboardPage, ServicesPage, LogsPage, DatabasesPage } from "./pages";
import { APP_VERSION } from "@/lib/version";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import type { ServiceName } from "@/types/services";
import "./lib/i18n";

function App() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [phpVersionSelectorOpen, setPhpVersionSelectorOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const [configService, setConfigService] = useState<ServiceName>("mysql");
  const [configView, setConfigView] = useState<"apache" | "mysql" | null>(null);

  // Copy path to clipboard helper
  const copyToClipboard = (path: string, label: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
    setTimeout(() => setCopiedPath(null), 2000);
  };
  const [currentPhpVersion, setCurrentPhpVersion] = useState("8.3");

  // Handler to open config editor for a specific service
  const handleOpenConfig = (service: ServiceName) => {
    setConfigService(service);
    setConfigEditorOpen(true);
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
        return <LogsPage />;

      case "databases":
        return <DatabasesPage />;

      case "settings":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t("navigation.settings")}</h2>

            {configView === "apache" ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigView(null)}
                    >
                      ← Back
                    </Button>
                    <div>
                      <CardTitle>Apache Configuration</CardTitle>
                      <CardDescription>
                        Configure Apache HTTP server settings
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">
                      Configuration File
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-muted-foreground flex-1">
                        config/httpd.conf
                      </p>
                      <Button
                        onClick={() =>
                          copyToClipboard(
                            "config/httpd.conf",
                            "Apache config path",
                          )
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7"
                      >
                        {copiedPath === "config/httpd.conf" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Document Root</label>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-muted-foreground flex-1">
                        www/
                      </p>
                      <Button
                        onClick={() =>
                          copyToClipboard("www/", "Document root path")
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7"
                      >
                        {copiedPath === "www/" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <p className="text-sm text-muted-foreground mt-2">80</p>
                  </div>
                </CardContent>
              </Card>
            ) : configView === "mysql" ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigView(null)}
                    >
                      ← Back
                    </Button>
                    <div>
                      <CardTitle>MySQL Configuration</CardTitle>
                      <CardDescription>
                        Configure MySQL database server settings
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">
                      Configuration File
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-muted-foreground flex-1">
                        config/my.cnf
                      </p>
                      <Button
                        onClick={() =>
                          copyToClipboard("config/my.cnf", "MySQL config path")
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7"
                      >
                        {copiedPath === "config/my.cnf" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Data Directory
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-muted-foreground flex-1">
                        mysql/data
                      </p>
                      <Button
                        onClick={() =>
                          copyToClipboard("mysql/data", "Data directory path")
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7"
                      >
                        {copiedPath === "mysql/data" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <p className="text-sm text-muted-foreground mt-2">3306</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                    <CardDescription>
                      Manage server configuration files
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        onClick={() => setConfigView("apache")}
                        className="h-20 flex flex-col gap-2"
                      >
                        <Server className="h-5 w-5" />
                        Apache Config
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfigView("mysql")}
                        className="h-20 flex flex-col gap-2"
                      >
                        <Server className="h-5 w-5" />
                        MySQL Config
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <EmptyState
                  icon={Info}
                  title="Advanced Settings Coming Soon"
                  description="Configure application preferences, auto-start options, update channels, and more. Feature planned for Phase 2."
                />
              </div>
            )}
          </div>
        );

      case "about":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t("navigation.about")}</h2>
            <Card>
              <CardHeader>
                <CardTitle>{t("app.title")}</CardTitle>
                <CardDescription>{t("app.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold">Version: {APP_VERSION}</p>
                  <p className="text-sm text-muted-foreground">
                    Built with Tauri, React, and Rust
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Author: Nomad Programmer</p>
                  <p className="text-sm text-muted-foreground">
                    shiv@srapsware.com
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AutoUpdater />
                  <BugReportDialog />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        "https://github.com/ProgrammerNomad/DevStackBox",
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    GitHub
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        "https://github.com/ProgrammerNomad/DevStackBox/wiki",
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Documentation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <DashboardPage
            onOpenPHPVersionSelector={() => setPhpVersionSelectorOpen(true)}
            onPageChange={setCurrentPage}
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
