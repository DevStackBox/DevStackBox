import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code, Settings, Activity, Download, Terminal, FileText } from "lucide-react";

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

interface PHPServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onVersionSelect?: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  onOpenTerminal?: () => void;
  compact?: boolean;
  currentVersion?: string;
}

export function PHPService({ 
  status, 
  loading, 
  onVersionSelect, 
  onOpenConfig, 
  onViewLogs,
  onOpenTerminal,
  compact = false,
  currentVersion = "8.2"
}: PHPServiceProps) {
  const { t } = useTranslation();

  const openPhpInfo = () => {
    window.open("http://localhost/phpinfo.php", "_blank");
  };

  const openComposer = () => {
    // TODO: Implement composer interface
    console.log("Opening Composer interface...");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <Card className="w-full">
        <CardHeader className={compact ? "pb-3" : ""}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Code className="h-5 w-5 text-purple-500" />
                {/* PHP is not a service, so no running indicator */}
              </div>
              <CardTitle className={compact ? "text-lg" : "text-xl"}>
                {t("services.php.title", "PHP Environment")} {currentVersion}
              </CardTitle>
            </div>
            <Badge 
              variant="secondary"
              className="bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {/* No pulsing animation for PHP environment */}
                {t("status.ready", "Ready")}
              </div>
            </Badge>
          </div>
          {!compact && (
            <CardDescription>
              {t("services.php.description", "PHP runtime environment (not a service)")}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Service Information */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t("common.version", "Version")}:</span>
              <span className="ml-2 font-mono">{status.version || currentVersion}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("common.status", "Status")}:</span>
              <span className="ml-2 text-blue-500 font-medium">{t("status.ready", "Ready")}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col space-y-2">
            {/* Version Selection */}
            {onVersionSelect && (
              <Button
                onClick={onVersionSelect}
                variant="outline"
                size={compact ? "sm" : "default"}
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="mr-2"
                  >
                    <Activity className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {t("actions.changeVersion", "Change Version")}
              </Button>
            )}

            {/* Quick Access Buttons - Always available since PHP is a runtime environment */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={openPhpInfo}
                variant="outline"
                size={compact ? "sm" : "default"}
                className="flex items-center"
              >
                <FileText className="mr-1 h-3 w-3" />
                {t("actions.phpinfo", "PHP Info")}
              </Button>
              {onOpenTerminal && (
                <Button
                  onClick={onOpenTerminal}
                  variant="outline"
                  size={compact ? "sm" : "default"}
                  className="flex items-center"
                  >
                    <Terminal className="mr-1 h-3 w-3" />
                    {t("actions.terminal", "Terminal")}
                  </Button>
                )}
              </div>

            {/* Composer Integration - Always available */}
            {!compact && (
              <Button
                onClick={openComposer}
                variant="ghost"
                size="sm"
                className="w-full flex items-center"
              >
                <Code className="mr-2 h-4 w-4" />
                {t("actions.composer", "Composer")}
              </Button>
            )}

            {/* Secondary Actions */}
            {!compact && (
              <div className="grid grid-cols-2 gap-2">
                {onOpenConfig && (
                  <Button
                    onClick={onOpenConfig}
                    variant="ghost"
                    size="sm"
                    className="flex items-center"
                  >
                    <Settings className="mr-1 h-3 w-3" />
                    {t("actions.config", "Config")}
                  </Button>
                )}
                {onViewLogs && (
                  <Button
                    onClick={onViewLogs}
                    variant="ghost"
                    size="sm"
                    className="flex items-center"
                  >
                    <Activity className="mr-1 h-3 w-3" />
                    {t("actions.logs", "Logs")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PHPService;
