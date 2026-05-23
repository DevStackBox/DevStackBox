import { FileText, Database, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function LogsLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.logsApache.path,
      label: t("navigation.apache", "Apache"),
      icon: Server,
    },
    {
      to: ROUTES.logsMysql.path,
      label: t("navigation.mysql", "MySQL"),
      icon: Database,
    },
    {
      to: ROUTES.logsPHP.path,
      label: t("navigation.php", "PHP"),
      icon: FileText,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={FileText}
          title={t("navigation.logs", "Logs")}
          description={t(
            "pages.logs.description",
            "Real-time service log viewer with search and auto-refresh.",
          )}
        />
      }
    />
  );
}

export default LogsLayout;
