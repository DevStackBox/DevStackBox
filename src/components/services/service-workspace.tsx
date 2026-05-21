import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Database, Server, Code, ExternalLink, FileText } from "lucide-react";
import { LogViewer } from "./log-viewer";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";

export type WorkspaceService = "apache" | "mysql" | "php";

interface ServiceWorkspaceProps {
  service: WorkspaceService;
  onOpenConfig: (service: WorkspaceService) => void;
}

const META: Record<
  WorkspaceService,
  { title: string; icon: typeof Server; iconColor: string }
> = {
  apache: { title: "Apache", icon: Server, iconColor: "text-orange-500" },
  mysql: { title: "MySQL", icon: Database, iconColor: "text-blue-500" },
  php: { title: "PHP", icon: Code, iconColor: "text-purple-500" },
};

/**
 * Phase 6.2 - bottom workspace panel that reflects the selected service.
 * Houses Logs + Config + service-specific extra actions in a Tabs layout.
 */
export function ServiceWorkspace({
  service,
  onOpenConfig,
}: ServiceWorkspaceProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const meta = META[service];
  const Icon = meta.icon;

  const pollLogs = async (svc: WorkspaceService) => {
    if (!isTauri()) {
      setLogs("Running in browser mode - real logs require Tauri app");
      return;
    }
    try {
      const content = await safeInvoke<string>(
        TAURI_COMMANDS.services.getServiceLogs,
        { service: svc },
      );
      if (typeof content === "string") {
        setLogs(content);
      }
    } catch {
      // ignore transient poll errors
    }
  };

  const refresh = async () => {
    setLoading(true);
    await pollLogs(service);
    setLoading(false);
  };

  useEffect(() => {
    // Reset + immediate fetch on service change.
    setLogs("");
    void refresh();
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
    }
    pollRef.current = window.setInterval(() => {
      void pollLogs(service);
    }, 2000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={`h-5 w-5 ${meta.iconColor}`} />
          <span>
            {t("services.workspace.title", "Workspace")} - {meta.title}
          </span>
        </CardTitle>
        <CardDescription>
          {t(
            "services.workspace.description",
            "Inspect logs and configuration for the selected service.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs">
              {t("services.workspace.tabs.logs", "Logs")}
            </TabsTrigger>
            <TabsTrigger value="config">
              {t("services.workspace.tabs.config", "Config")}
            </TabsTrigger>
            <TabsTrigger value="actions">
              {t("services.workspace.tabs.actions", "Actions")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            <LogViewer
              logs={logs}
              onRefresh={refresh}
              onClear={() => setLogs("")}
              title={`${meta.title} ${t("services.logs.title", "Logs")}`}
              description={t(
                "services.workspace.logsDesc",
                "Auto-refreshes every 2 seconds.",
              )}
              searchable
              autoScroll={autoScroll}
              onAutoScrollChange={setAutoScroll}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="config">
            <div className="rounded-md border p-6 text-sm text-muted-foreground space-y-4">
              <p>
                {t(
                  "services.workspace.configHint",
                  "Open the configuration file in the full editor with syntax highlighting and backup/restore.",
                )}
              </p>
              <Button onClick={() => onOpenConfig(service)}>
                <FileText className="mr-2 h-4 w-4" />
                {t("actions.openConfig", "Open Config Editor")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="actions">
            <ServiceExtras service={service} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ServiceExtras({ service }: { service: WorkspaceService }) {
  const { t } = useTranslation();

  const buttons: { label: string; onClick: () => void }[] = [];
  if (service === "apache") {
    buttons.push(
      {
        label: t("actions.open", "Open localhost"),
        onClick: () => window.open("http://localhost", "_blank"),
      },
      {
        label: t("actions.www", "Open WWW folder"),
        onClick: () => window.open("http://localhost/www", "_blank"),
      },
    );
  } else if (service === "mysql") {
    buttons.push(
      {
        label: t("quickActions.openPhpMyAdmin", "Open phpMyAdmin"),
        onClick: () => window.open("http://localhost/phpmyadmin", "_blank"),
      },
      {
        label: t("actions.copy", "Copy connection string"),
        onClick: () => {
          navigator.clipboard.writeText("mysql://root@localhost:3306");
        },
      },
    );
  } else {
    buttons.push(
      {
        label: t("actions.phpinfo", "Open PHP Info"),
        onClick: () => window.open("http://localhost/phpinfo.php", "_blank"),
      },
      {
        label: t("actions.test", "Open test page"),
        onClick: () => window.open("http://localhost/test.php", "_blank"),
      },
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b, i) => (
        <Button key={i} variant="outline" size="sm" onClick={b.onClick}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {b.label}
        </Button>
      ))}
    </div>
  );
}

export default ServiceWorkspace;
