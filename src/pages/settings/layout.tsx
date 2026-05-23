import { Settings as SettingsIcon, HardDriveDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function SettingsLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.settings.path,
      label: t("settings.tabs.general", "General"),
      icon: SettingsIcon,
      end: true,
    },
    {
      to: ROUTES.settingsBackup.path,
      label: t("navigation.backup", "Backup & Restore"),
      icon: HardDriveDownload,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={SettingsIcon}
          title={t("navigation.settings", "Settings")}
          description={t(
            "workspace.settings.description",
            "App preferences and full stack backup.",
          )}
        />
      }
    />
  );
}

export default SettingsLayout;
