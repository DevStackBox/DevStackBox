import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { RefreshCw, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";

interface PhpExtension {
  name: string;
  enabled: boolean;
  builtin?: boolean;
}

export function PhpExtensionsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [extensions, setExtensions] = useState<PhpExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  // Resolved active PHP version - needed for both list and toggle commands.
  const [activeVersion, setActiveVersion] = useState("8.3");

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setExtensions([]);
      return;
    }
    setLoading(true);
    try {
      // Resolve the currently active branch before listing extensions; the
      // backend command requires a version string.
      const versions = await safeInvoke<
        { version: string; is_active: boolean }[]
      >(TAURI_COMMANDS.php.getVersions);
      const ver = versions?.find((v) => v.is_active)?.version ?? "8.3";
      setActiveVersion(ver);

      const list = await safeInvoke<PhpExtension[]>(
        TAURI_COMMANDS.php.listExtensions,
        { version: ver },
      );
      setExtensions(list ?? []);
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async (ext: PhpExtension) => {
    if (!isTauri()) return;
    try {
      await safeInvoke(TAURI_COMMANDS.php.toggleExtension, {
        version: activeVersion,
        name: ext.name,
        enable: !ext.enabled,
      });
      await refresh();
      toast({
        title: ext.enabled
          ? t("php.extensionDisabled", "Extension disabled")
          : t("php.extensionEnabled", "Extension enabled"),
        description: ext.name,
      });
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const filtered = extensions.filter((e) =>
    e.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Puzzle className="h-4 w-4" />
                {t("php.extensions.title", "PHP Extensions")}
              </CardTitle>
              <CardDescription>
                {t(
                  "php.extensions.description",
                  "Toggle extensions for the active PHP version. Restart Apache to apply.",
                )}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {t("actions.refresh", "Refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder={t("php.extensions.filter", "Filter extensions...")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filtered.length === 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {t("php.extensions.empty", "No extensions found.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((ext) => (
                <div
                  key={ext.name}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm">
                        {ext.name}
                      </span>
                      {ext.builtin && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("php.extensions.builtin", "built-in")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={ext.enabled}
                    onCheckedChange={() => toggle(ext)}
                    disabled={ext.builtin}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PhpExtensionsPage;
