import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";

interface PhpExtension {
  name: string;
  enabled: boolean;
  dll_present: boolean;
}

interface PhpExtensionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
}

const BROWSER_PREVIEW: PhpExtension[] = [
  { name: "curl", enabled: true, dll_present: true },
  { name: "gd", enabled: false, dll_present: true },
  { name: "mbstring", enabled: true, dll_present: true },
  { name: "openssl", enabled: true, dll_present: true },
  { name: "pdo_mysql", enabled: true, dll_present: true },
  { name: "intl", enabled: false, dll_present: true },
];

export function PhpExtensionsDialog({
  isOpen,
  onClose,
  version,
}: PhpExtensionsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [extensions, setExtensions] = useState<PhpExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setExtensions(BROWSER_PREVIEW);
        return;
      }
      const result = await safeInvoke<PhpExtension[]>(
        TAURI_COMMANDS.php.listExtensions,
        { version },
      );
      setExtensions(result ?? []);
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return extensions;
    return extensions.filter((e) => e.name.toLowerCase().includes(q));
  }, [extensions, search]);

  const toggle = async (ext: PhpExtension, next: boolean) => {
    setBusy(ext.name);
    // Optimistic update.
    setExtensions((prev) =>
      prev.map((e) => (e.name === ext.name ? { ...e, enabled: next } : e)),
    );
    try {
      if (!isTauri()) {
        toast({
          title: t("common.previewMode", "Browser preview"),
          description: t(
            "php.extensions.previewToggle",
            "Toggles are not persisted in browser preview.",
          ),
        });
        return;
      }
      const ok = await safeInvoke<boolean>(TAURI_COMMANDS.php.toggleExtension, {
        version,
        name: ext.name,
        enable: next,
      });
      if (!ok) {
        throw new Error("Tauri command returned false");
      }
      toast({
        title: next
          ? t("php.extensions.enabled", "Extension enabled")
          : t("php.extensions.disabled", "Extension disabled"),
        description: `${ext.name} \u00b7 ${t(
          "php.extensions.restartHint",
          "Restart Apache for the change to take effect.",
        )}`,
      });
    } catch (err) {
      // Roll back.
      setExtensions((prev) =>
        prev.map((e) => (e.name === ext.name ? { ...e, enabled: !next } : e)),
      );
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("php.extensions.title", "PHP Extensions")} &middot; {version}
          </DialogTitle>
          <DialogDescription>
            {t(
              "php.extensions.description",
              "Toggle extensions in php.ini. Restart Apache to apply changes.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("php.extensions.search", "Search extensions...")}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t("common.refresh", "Refresh")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          {loading && extensions.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("php.extensions.empty", "No extensions match your search.")}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((ext) => (
                <li
                  key={ext.name}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm">
                        {ext.name}
                      </span>
                      {!ext.dll_present && (
                        <Badge variant="outline" className="text-xs">
                          {t("php.extensions.noDll", "DLL missing")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={ext.enabled}
                    onCheckedChange={(checked) => void toggle(ext, checked)}
                    disabled={busy === ext.name || !ext.dll_present}
                    aria-label={`${ext.name} ${
                      ext.enabled ? "enabled" : "disabled"
                    }`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
