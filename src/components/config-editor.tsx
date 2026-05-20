import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Save, RotateCcw, Download, AlertCircle } from "lucide-react";
import type { ServiceName } from "@/types/services";

interface ConfigEditorProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceName;
}

export function ConfigEditor({ isOpen, onClose, service }: ConfigEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [config, setConfig] = useState("");
  const [originalConfig, setOriginalConfig] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const content = await safeInvoke<string>(TAURI_COMMANDS.config.read, {
        service,
      });
      if (content) {
        setConfig(content);
        setOriginalConfig(content);
        setHasChanges(false);
      }
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: `Failed to load config: ${error}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const result = await safeInvoke<string>(TAURI_COMMANDS.config.update, {
        service,
        content: config,
      });

      if (result) {
        toast({
          title: t("common.success", "Success"),
          description: result,
        });
        setOriginalConfig(config);
        setHasChanges(false);
      }
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: `Failed to save config: ${error}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const backupConfig = async () => {
    setLoading(true);
    try {
      const result = await safeInvoke<string>(TAURI_COMMANDS.config.backup, {
        service,
      });
      if (result) {
        toast({
          title: t("common.success", "Success"),
          description: result,
        });
      }
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: `Failed to backup config: ${error}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetConfig = () => {
    setConfig(originalConfig);
    setHasChanges(false);
  };

  const handleConfigChange = (value: string) => {
    setConfig(value);
    setHasChanges(value !== originalConfig);
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      loadConfig();
    } else {
      if (hasChanges) {
        const confirm = window.confirm(
          t(
            "config.unsavedChanges",
            "You have unsaved changes. Are you sure you want to close?",
          ),
        );
        if (!confirm) return;
      }
      onClose();
    }
  };

  const getServiceTitle = () => {
    switch (service) {
      case "mysql":
        return t("services.mysql.configTitle", "MySQL Configuration");
      case "apache":
        return t("services.apache.configTitle", "Apache Configuration");
      case "php":
        return t("services.php.configTitle", "PHP Configuration");
      default:
        return t("config.title", "Configuration Editor");
    }
  };

  const getConfigFileName = () => {
    switch (service) {
      case "mysql":
        return "my.cnf";
      case "apache":
        return "httpd.conf";
      case "php":
        return "php.ini";
      default:
        return "config";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>{getServiceTitle()}</span>
            <span className="text-sm text-muted-foreground font-normal">
              ({getConfigFileName()})
            </span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "config.description",
              "Edit configuration file. A backup will be created automatically when you save.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center space-x-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-sm"
            >
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-700 dark:text-yellow-400">
                {t("config.unsavedWarning", "You have unsaved changes")}
              </span>
            </motion.div>
          )}

          <div className="relative">
            <Textarea
              value={config}
              onChange={(e) => handleConfigChange(e.target.value)}
              className="font-mono text-sm min-h-[500px] resize-none"
              placeholder={
                loading
                  ? t("common.loading", "Loading...")
                  : t("config.placeholder", "Configuration will appear here...")
              }
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={backupConfig}
            disabled={loading || !config}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("config.backup", "Backup")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetConfig}
            disabled={loading || !hasChanges}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t("config.reset", "Reset")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => handleOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={saveConfig} disabled={loading || !hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
