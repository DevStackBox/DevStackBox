import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import Editor from "@monaco-editor/react";
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
  const { theme } = useTheme();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);

  const monacoTheme =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "vs-dark"
      : "vs";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await safeInvoke<string>(TAURI_COMMANDS.config.read, {
        service,
      });
      if (data != null) {
        setContent(data);
        setOriginal(data);
      }
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: `Failed to load config: ${err}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [service, t, toast]);

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
      setOriginal(content);
      toast({ title: t("config.saved", "Configuration saved") });
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
                onClick={load}
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
                onClick={() => setContent(original)}
                disabled={loading || !dirty}
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
          <div className="overflow-hidden rounded-md border border-border">
            <Editor
              height="60vh"
              language={language}
              value={content}
              theme={monacoTheme}
              onChange={(v) => setContent(v ?? "")}
              options={{
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
