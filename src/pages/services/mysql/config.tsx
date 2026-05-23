import { useTranslation } from "react-i18next";
import { WorkspaceConfigEditor } from "../_shared/workspace-config-editor";

export function MySqlConfigPage() {
  const { t } = useTranslation();
  return (
    <WorkspaceConfigEditor
      service="mysql"
      title={t("mysql.config.title", "MySQL Configuration")}
      filename="mysql/my.cnf"
      language="ini"
    />
  );
}

export default MySqlConfigPage;
