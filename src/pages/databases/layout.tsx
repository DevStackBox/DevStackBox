import { Database, Users, HardDriveDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function DatabasesLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.databases.path,
      label: t("navigation.databases", "Databases"),
      icon: Database,
      end: true,
    },
    {
      to: ROUTES.databasesUsers.path,
      label: t("navigation.users", "Users"),
      icon: Users,
    },
    {
      to: ROUTES.databasesBackups.path,
      label: t("navigation.dbBackups", "Backups"),
      icon: HardDriveDownload,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={Database}
          title={t("navigation.databases", "Databases")}
          description={t(
            "workspace.databases.description",
            "Databases, MySQL users, and per-database backups.",
          )}
        />
      }
    />
  );
}

export default DatabasesLayout;
