import { Database, FileText, FileCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function MysqlLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.mysql.path,
      label: t("workspace.overview", "Overview"),
      icon: Database,
      end: true,
    },
    {
      to: ROUTES.mysqlLogs.path,
      label: t("navigation.logs", "Logs"),
      icon: FileText,
    },
    {
      to: ROUTES.mysqlConfig.path,
      label: t("navigation.config", "Config"),
      icon: FileCog,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={Database}
          title={t("navigation.mysql", "MySQL")}
          description={t(
            "workspace.mysql.description",
            "Database server status and logs.",
          )}
        />
      }
    />
  );
}

export default MysqlLayout;
