import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Server, Power, Bell, Palette, FileCog } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import type { ServiceName } from "@/types/services";
import i18n from "@/lib/i18n";

const AUTO_CHECK_KEY = "devstackbox.settings.autoCheckUpdates";

interface SettingsPageProps {
  onOpenConfig: (service: ServiceName) => void;
}

export function SettingsPage({ onOpenConfig }: SettingsPageProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [autostart, setAutostartState] = useState<boolean>(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autoCheck, setAutoCheck] = useState<boolean>(
    () => localStorage.getItem(AUTO_CHECK_KEY) !== "false",
  );

  // Read the current autostart status on mount so the toggle matches reality.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTauri()) return;
      try {
        const enabled = await safeInvoke<boolean>(
          TAURI_COMMANDS.system.getAutostart,
        );
        if (!cancelled) setAutostartState(Boolean(enabled));
      } catch (err) {
        // Non-fatal: leave default false.
        console.warn("Failed to read autostart:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAutostart = async (checked: boolean) => {
    if (!isTauri()) {
      setAutostartState(checked);
      toast({
        title: t("settings.previewOnly", "Preview only"),
        description: t(
          "settings.previewOnlyDesc",
          "Autostart is configured by the desktop app at runtime.",
        ),
      });
      return;
    }
    setAutostartBusy(true);
    try {
      await safeInvoke<boolean>(TAURI_COMMANDS.system.setAutostart, {
        enabled: checked,
      });
      setAutostartState(checked);
      toast({
        variant: "success",
        title: checked
          ? t("settings.autostartEnabled", "Autostart enabled")
          : t("settings.autostartDisabled", "Autostart disabled"),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("settings.autostartFailed", "Failed to update autostart"),
        description: `${err}`,
      });
    } finally {
      setAutostartBusy(false);
    }
  };

  const handleAutoCheck = (checked: boolean) => {
    setAutoCheck(checked);
    localStorage.setItem(AUTO_CHECK_KEY, String(checked));
    toast({
      title: checked
        ? t("settings.autoCheckOn", "Automatic update checks enabled")
        : t("settings.autoCheckOff", "Automatic update checks disabled"),
      description: t(
        "settings.autoCheckHint",
        "Takes effect on the next app launch.",
      ),
    });
  };

  const handleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("navigation.settings", "Settings")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "pages.settings.description",
            "Appearance, startup, updates and configuration shortcuts.",
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t("settings.appearance", "Appearance")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.appearanceDesc",
              "Theme and language used across the app.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.theme", "Theme")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.themeDesc",
                  "Light, dark, or follow your system preference.",
                )}
              </div>
            </div>
            <Select
              value={theme}
              onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  {t("settings.themeLight", "Light")}
                </SelectItem>
                <SelectItem value="dark">
                  {t("settings.themeDark", "Dark")}
                </SelectItem>
                <SelectItem value="system">
                  {t("settings.themeSystem", "System")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.language", "Language")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("settings.languageDesc", "User interface language.")}
              </div>
            </div>
            <Select value={i18n.language} onValueChange={handleLanguage}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">
                  {"\u0939\u093f\u0928\u094d\u0926\u0940"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            {t("settings.startup", "Startup")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.startupDesc",
              "Control whether DevStackBox launches when you sign in.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.autostart", "Launch at login")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.autostartDesc",
                  "Adds a Windows registry entry under HKCU Run. No admin needed.",
                )}
              </div>
            </div>
            <Switch
              checked={autostart}
              onCheckedChange={handleAutostart}
              disabled={autostartBusy}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("settings.updates", "Updates")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.updatesDesc",
              "DevStackBox can quietly check GitHub Releases for new versions.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.autoCheck", "Check for updates automatically")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.autoCheckDesc",
                  "On launch and once every 6 hours.",
                )}
              </div>
            </div>
            <Switch checked={autoCheck} onCheckedChange={handleAutoCheck} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCog className="h-5 w-5" />
            {t("settings.configuration", "Configuration")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.configurationDesc",
              "Edit the configuration file for each service. Backups are taken automatically before each save.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button
            variant="outline"
            className="h-20 flex-col gap-2"
            onClick={() => onOpenConfig("apache")}
          >
            <Server className="h-5 w-5" />
            {t("settings.openApacheConfig", "Apache (httpd.conf)")}
          </Button>
          <Button
            variant="outline"
            className="h-20 flex-col gap-2"
            onClick={() => onOpenConfig("mysql")}
          >
            <Server className="h-5 w-5" />
            {t("settings.openMysqlConfig", "MySQL (my.cnf)")}
          </Button>
          <Button
            variant="outline"
            className="h-20 flex-col gap-2"
            onClick={() => onOpenConfig("php")}
          >
            <Server className="h-5 w-5" />
            {t("settings.openPhpConfig", "PHP (php.ini)")}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default SettingsPage;
