import { Server, Puzzle, FileCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function PhpLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.php.path,
      label: t("workspace.overview", "Overview"),
      icon: Server,
      end: true,
    },
    {
      to: ROUTES.phpExtensions.path,
      label: t("navigation.extensions", "Extensions"),
      icon: Puzzle,
    },
    {
      to: ROUTES.phpConfig.path,
      label: t("navigation.config", "Config"),
      icon: FileCog,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={Server}
          title={t("navigation.php", "PHP")}
          description={t(
            "workspace.php.description",
            "PHP runtime — version, extensions, and php.ini.",
          )}
        />
      }
    />
  );
}

export default PhpLayout;
