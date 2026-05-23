import { useTranslation } from "react-i18next";
import { WorkspaceConfigEditor } from "../_shared/workspace-config-editor";

export function PhpConfigPage() {
  const { t } = useTranslation();
  return (
    <WorkspaceConfigEditor
      service="php"
      title={t("php.config.title", "PHP Configuration")}
      filename="php/current/php.ini"
      language="ini"
    />
  );
}

export default PhpConfigPage;
