import { Server, FileText, FileCog, Globe, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function ApacheLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.apache.path,
      label: t("workspace.overview", "Overview"),
      icon: Server,
      end: true,
    },
    {
      to: ROUTES.apacheLogs.path,
      label: t("navigation.logs", "Logs"),
      icon: FileText,
    },
    {
      to: ROUTES.apacheConfig.path,
      label: t("navigation.config", "Config"),
      icon: FileCog,
    },
    {
      to: ROUTES.apacheVhosts.path,
      label: t("navigation.vhosts", "Virtual Hosts"),
      icon: Globe,
    },
    {
      to: ROUTES.apacheSsl.path,
      label: t("navigation.ssl", "SSL"),
      icon: Lock,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={Server}
          title={t("navigation.apache", "Apache")}
          description={t(
            "workspace.apache.description",
            "Web server, virtual hosts, and SSL.",
          )}
        />
      }
    />
  );
}

export default ApacheLayout;
