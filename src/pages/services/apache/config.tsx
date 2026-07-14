import { useTranslation } from "react-i18next";
import { WorkspaceConfigEditor } from "../_shared/workspace-config-editor";

export function ApacheConfigPage() {
  const { t } = useTranslation();
  return (
    <WorkspaceConfigEditor
      service="apache"
      title={t("apache.config.title", "Apache Configuration")}
      filename="%LOCALAPPDATA%\\devstackbox\\config\\httpd.conf"
      language="apacheconf"
    />
  );
}

export default ApacheConfigPage;
