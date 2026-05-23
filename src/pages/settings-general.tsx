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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Power, Bell, Palette } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import i18n from "@/lib/i18n";

const AUTO_CHECK_KEY = "devstackbox.settings.autoCheckUpdates";
const AUTOSTART_APACHE_KEY = "devstackbox.settings.autoStartApache";
const AUTOSTART_MYSQL_KEY = "devstackbox.settings.autoStartMysql";
const MINIMIZE_TO_TRAY_KEY = "devstackbox.settings.minimizeToTray";
const UPDATE_CHANNEL_KEY = "devstackbox.settings.updateChannel";

interface SettingsPageProps {}

export function SettingsPage({}: SettingsPageProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [autostart, setAutostartState] = useState<boolean>(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autoCheck, setAutoCheck] = useState<boolean>(
    () => localStorage.getItem(AUTO_CHECK_KEY) !== "false",
  );
  const [autoStartApache, setAutoStartApache] = useState<boolean>(
    () => localStorage.getItem(AUTOSTART_APACHE_KEY) === "true",
  );
  const [autoStartMysql, setAutoStartMysql] = useState<boolean>(
    () => localStorage.getItem(AUTOSTART_MYSQL_KEY) === "true",
  );
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(
    () => localStorage.getItem(MINIMIZE_TO_TRAY_KEY) !== "false",
  );
  const [updateChannel, setUpdateChannel] = useState<string>(
    () => localStorage.getItem(UPDATE_CHANNEL_KEY) ?? "stable",
  );

  const persistBool = (key: string, value: boolean) => {
    localStorage.setItem(key, String(value));
  };

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
        <CardContent className="space-y-4">
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.updateChannel", "Update channel")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.updateChannelDesc",
                  "Stable receives signed releases. Beta receives pre-releases.",
                )}
              </div>
            </div>
            <Select
              value={updateChannel}
              onValueChange={(v) => {
                setUpdateChannel(v);
                localStorage.setItem(UPDATE_CHANNEL_KEY, v);
                toast({
                  title: t("settings.updateChannelSet", "Update channel set"),
                  description: t(
                    "settings.updateChannelHint",
                    "Takes effect on the next update check.",
                  ),
                });
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">
                  {t("settings.channelStable", "Stable")}
                </SelectItem>
                <SelectItem value="beta">
                  {t("settings.channelBeta", "Beta")}
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
            {t("settings.services", "Services on app launch")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.servicesDesc",
              "Automatically start selected services when DevStackBox opens. Applies on next launch.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.autoStartApache", "Auto-start Apache")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.autoStartApacheDesc",
                  "Start the HTTP server when DevStackBox launches.",
                )}
              </div>
            </div>
            <Switch
              checked={autoStartApache}
              onCheckedChange={(v) => {
                setAutoStartApache(v);
                persistBool(AUTOSTART_APACHE_KEY, v);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.autoStartMysql", "Auto-start MySQL")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.autoStartMysqlDesc",
                  "Start the database server when DevStackBox launches.",
                )}
              </div>
            </div>
            <Switch
              checked={autoStartMysql}
              onCheckedChange={(v) => {
                setAutoStartMysql(v);
                persistBool(AUTOSTART_MYSQL_KEY, v);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.minimizeToTray", "Minimize to tray on close")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.minimizeToTrayDesc",
                  "Keep services running in the background when the window closes.",
                )}
              </div>
            </div>
            <Switch
              checked={minimizeToTray}
              onCheckedChange={(v) => {
                setMinimizeToTray(v);
                persistBool(MINIMIZE_TO_TRAY_KEY, v);
              }}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default SettingsPage;
