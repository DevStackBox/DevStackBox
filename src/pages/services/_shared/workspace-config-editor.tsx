import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import "@/lib/editor";
import { Save, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import type { ServiceName } from "@/types/services";

interface WorkspaceConfigEditorProps {
  service: ServiceName;
  title: string;
  filename: string;
  language?: string;
}

/**
 * Inline config editor used inside service workspace Config tabs. Replaces
 * the modal-dialog flow with a routed, full-page editor.
 */
export function WorkspaceConfigEditor({
  service,
  title,
  filename,
  language = "ini",
}: WorkspaceConfigEditorProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const draftKey = `devstackbox-config-draft-${service}`;

  const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "vs";

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await safeInvoke<string>(TAURI_COMMANDS.config.read, {
        service,
      }, { fresh });
      if (data == null) throw new Error("Configuration was not returned");
      setLoaded(true);
      const history = await safeInvoke<string[]>(TAURI_COMMANDS.config.listBackups, { service }, { fresh });
      setBackups(history ?? []);
      if (data != null) {
        setContent(localStorage.getItem(draftKey) ?? data);
        setOriginal(data);
      }
    } catch (err) {
      setLoadError(true);
      toast({
        title: t("common.error", "Error"),
        description: `Failed to load config: ${err}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [service, draftKey, t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setLoading(true);
    try {
      await safeInvoke(TAURI_COMMANDS.config.update, {
        service,
        content,
      });
      localStorage.removeItem(draftKey);
      await load();
      toast({ title: "Configuration validated and saved", description: "Restart the service to apply your changes." });
    } catch (err) {
      toast({
        title: t("config.saveFailed", "Save failed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const dirty = content !== original;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{title}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {filename}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (content !== original && !window.confirm("Discard unsaved changes and reload?")) return; localStorage.removeItem(draftKey); void load(true); }}
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                {t("actions.reload", "Reload")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { localStorage.removeItem(draftKey); setContent(original); }}
                disabled={loading || !loaded || loadError || !dirty}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("actions.revert", "Revert")}
              </Button>
              <Button size="sm" onClick={save} disabled={loading || !dirty}>
                <Save className="mr-2 h-4 w-4" />
                {t("actions.save", "Save")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <label htmlFor="config-history">Restore a saved backup</label>
            <select id="config-history" className="rounded border bg-background p-1" value="" disabled={loading || backups.length === 0} onChange={async (event) => {
              const backupName = event.target.value;
              if (!backupName || !window.confirm("Restore this configuration? Your current configuration will be backed up first.")) return;
              setLoading(true);
              try {
                await safeInvoke(TAURI_COMMANDS.config.restoreBackup, { service, backupName });
                localStorage.removeItem(draftKey);
                await load();
                toast({ title: "Configuration restored", description: "Restart the service to apply." });
              } catch (error) { toast({ title: "Restore failed", description: String(error), variant: "destructive" }); }
              finally { setLoading(false); }
            }}><option value="">{backups.length ? "Choose a backup" : "No backups yet"}</option>{backups.map(name => <option key={name} value={name}>{name}</option>)}</select>
          </div>
          {dirty && <p className="mb-2 text-xs text-muted-foreground" role="status">Unsaved changes. Your draft is kept locally when you leave this screen.</p>}
          {loading && <p role="status" className="mb-3 text-sm">{t("audit.configLoading")}</p>}
          {loadError && <p role="alert" className="mb-3 text-sm text-destructive">{t("audit.configFailed")}</p>}
          <div className="overflow-hidden rounded-md border border-border" aria-busy={loading}>
            <Editor
              height="60vh"
              language={language}
              value={content}
              theme={monacoTheme}
              onChange={(v) => { const next = v ?? ""; setContent(next); if (next === original) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, next); }}
              loading={<p role="status">{t("audit.configLoading")}</p>}
              options={{
                readOnly: loading || !loaded || loadError,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default WorkspaceConfigEditor;
