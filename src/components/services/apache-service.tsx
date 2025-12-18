import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Server, Play, Square, ExternalLink, Settings, Activity } from "lucide-react";

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

interface ApacheServiceProps {
  status: ServiceStatus;
  loading: boolean;
  onToggle: () => void;
  onOpenConfig?: () => void;
  onViewLogs?: () => void;
  compact?: boolean;
}

export function ApacheService({ 
  status, 
  loading, 
  onToggle, 
  onOpenConfig, 
  onViewLogs,
  compact = false 
}: ApacheServiceProps) {
  const { t } = useTranslation();

  const openApache = () => {
    window.open("http://localhost", "_blank");
  };

  const openWWW = () => {
    window.open("http://localhost/www", "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full">
        <CardHeader className={compact ? "pb-3" : ""}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Server className="h-5 w-5 text-orange-500" />
                {status.running && (
                  <motion.div
                    className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
              <CardTitle className={compact ? "text-lg" : "text-xl"}>
                {t("services.apache.title", "Apache HTTP Server")}
              </CardTitle>
            </div>
            <Badge 
              variant={status.running ? "default" : "secondary"}
              className={`${status.running ? "bg-green-500 hover:bg-green-600" : "bg-gray-500 hover:bg-gray-600"} transition-colors`}
            >
              <div className="flex items-center gap-1.5">
                {status.running && (
                  <motion.div
                    className="h-2 w-2 rounded-full bg-white"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
                {status.running ? t("status.running", "Running") : t("status.stopped", "Stopped")}
              </div>
            </Badge>
          </div>
          {!compact && (
            <CardDescription>
              {t("services.apache.description", "Local web server for hosting PHP applications")}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Service Information */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t("common.port", "Port")}:</span>
              <span className="ml-2 font-mono">{status.port || 80}</span>
            </div>
            {status.version && (
              <div>
                <span className="text-muted-foreground">{t("common.version", "Version")}:</span>
                <span className="ml-2 font-mono">{status.version}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col space-y-2">
            {/* Primary Action */}
            <Button
              onClick={onToggle}
              disabled={loading}
              variant={status.running ? "destructive" : "default"}
              size={compact ? "sm" : "default"}
              className="w-full"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-2"
                >
                  <Activity className="h-4 w-4" />
                </motion.div>
              ) : status.running ? (
                <Square className="mr-2 h-4 w-4" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {loading 
                ? t("common.loading", "Loading...") 
                : status.running 
                  ? t("actions.stop", "Stop") 
                  : t("actions.start", "Start")
              }
            </Button>

            {/* Quick Access Buttons */}
            {status.running && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={openApache}
                  variant="outline"
                  size={compact ? "sm" : "default"}
                  className="flex items-center"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {t("actions.open", "Open")}
                </Button>
                <Button
                  onClick={openWWW}
                  variant="outline"
                  size={compact ? "sm" : "default"}
                  className="flex items-center"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {t("actions.www", "WWW")}
                </Button>
              </div>
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

export default ApacheService;
