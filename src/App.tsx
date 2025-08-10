import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "./components/language-switcher";
import { AutoUpdater } from "./components/auto-updater";
import { Sidebar } from "./components/sidebar";
import { CommandPalette } from "./components/command-palette";
import { PHPVersionSelector } from "./components/php-version-selector";
import { DashboardPage, ServicesPage } from "./pages";
import "./lib/i18n";

function App() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [phpVersionSelectorOpen, setPhpVersionSelectorOpen] = useState(false);
  const [currentPhpVersion, setCurrentPhpVersion] = useState("8.2");
  const [configView, setConfigView] = useState<'apache' | 'mysql' | null>(null);

  // Initialize app and check binaries
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const binaries = await invoke('check_binaries') as Record<string, boolean>;
      console.log('Binary status:', binaries);
      
      if (!binaries.mysql) {
        console.warn('MySQL binary not found at mysql/bin/mysqld.exe');
      }
      if (!binaries.apache) {
        console.warn('Apache binary not found at apache/bin/httpd.exe');
      }
      if (!binaries['php8.2']) {
        console.warn('PHP 8.2 binary not found at php/8.2/php.exe');
      }
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  };

  // Stub function for command palette - services are now managed by individual pages
  const handleServiceToggle = (service: string) => {
    console.log(`Toggle ${service} service`);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case "services":
        return <ServicesPage 
          currentPhpVersion={currentPhpVersion} 
          onOpenPHPVersionSelector={() => setPhpVersionSelectorOpen(true)}
        />;
      
      case "projects":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t('navigation.projects')}</h2>
            <Card>
              <CardHeader>
                <CardTitle>Project Management</CardTitle>
                <CardDescription>Manage your PHP projects and virtual hosts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t('common.comingSoon')}</p>
              </CardContent>
            </Card>
          </div>
        );
      
      case "logs":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t('navigation.logs')}</h2>
            <Card>
              <CardHeader>
                <CardTitle>Log Viewer</CardTitle>
                <CardDescription>View real-time logs from all services</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t('common.comingSoon')}</p>
              </CardContent>
            </Card>
          </div>
        );
      
      case "settings":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t('navigation.settings')}</h2>
            
            {configView === 'apache' ? (
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
                      <CardDescription>Configure Apache HTTP server settings</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Configuration File</label>
                    <p className="text-sm text-muted-foreground mb-2">C:\box\DevStackBox\config\httpd.conf</p>
                    <Button
                      onClick={() => alert('Opening Apache config editor (coming soon)')}
                      variant="outline"
                    >
                      Edit Configuration
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Document Root</label>
                    <p className="text-sm text-muted-foreground">C:\box\DevStackBox\www</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <p className="text-sm text-muted-foreground">80</p>
                  </div>
                </CardContent>
              </Card>
            ) : configView === 'mysql' ? (
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
                      <CardDescription>Configure MySQL database server settings</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Configuration File</label>
                    <p className="text-sm text-muted-foreground mb-2">C:\box\DevStackBox\config\my.cnf</p>
                    <Button
                      onClick={() => alert('Opening MySQL config editor (coming soon)')}
                      variant="outline"
                    >
                      Edit Configuration
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Data Directory</label>
                    <p className="text-sm text-muted-foreground">C:\box\DevStackBox\mysql\data</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <p className="text-sm text-muted-foreground">3306</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                    <CardDescription>Manage server configuration files</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setConfigView('apache')}
                        className="h-20 flex flex-col gap-2"
                      >
                        <Server className="h-5 w-5" />
                        Apache Config
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setConfigView('mysql')}
                        className="h-20 flex flex-col gap-2"
                      >
                        <Server className="h-5 w-5" />
                        MySQL Config
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Application Settings</CardTitle>
                    <CardDescription>Configure DevStackBox preferences</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{t('common.comingSoon')}</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        );
      
      case "about":
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">{t('navigation.about')}</h2>
            <Card>
              <CardHeader>
                <CardTitle>{t('app.title')}</CardTitle>
                <CardDescription>{t('app.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold">Version: 0.1.0-alpha.1</p>
                  <p className="text-sm text-muted-foreground">Built with Tauri, React, and Rust</p>
                </div>
                <div>
                  <p className="font-semibold">Author: Nomad Programmer</p>
                  <p className="text-sm text-muted-foreground">shiv@srapsware.com</p>
                </div>
                <div className="flex items-center gap-2">
                  <AutoUpdater />
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
        <div className={`transition-all duration-200 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}>
          {/* Top Bar */}
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                <h1 className="text-lg font-semibold">DevStackBox</h1>
                <Badge variant="outline" className="text-xs">v0.1.0-alpha.1</Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <AutoUpdater />
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="container mx-auto px-4 py-6">
            {renderPage()}
          </main>
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
      </div>
    </ThemeProvider>
  );
}

export default App;
