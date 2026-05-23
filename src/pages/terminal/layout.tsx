import { SquareTerminal, Code, Database, GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceWorkspaceLayout } from "@/components/service-workspace-layout";
import { ServiceWorkspaceHeader } from "@/components/service-workspace-header";
import { ROUTES } from "@/lib/routes";

export function TerminalLayout() {
  const { t } = useTranslation();

  const tabs = [
    {
      to: ROUTES.terminalShell.path,
      label: t("terminal.shell", "Shell"),
      icon: SquareTerminal,
    },
    {
      to: ROUTES.terminalPowershell.path,
      label: t("terminal.powershell", "PowerShell"),
      icon: SquareTerminal,
    },
    {
      to: ROUTES.terminalCmd.path,
      label: t("terminal.cmd", "CMD"),
      icon: SquareTerminal,
    },
    {
      to: ROUTES.terminalPhp.path,
      label: t("terminal.phpCli", "PHP CLI"),
      icon: Code,
    },
    {
      to: ROUTES.terminalMysql.path,
      label: t("terminal.mysqlCli", "MySQL CLI"),
      icon: Database,
    },
    {
      to: ROUTES.terminalGit.path,
      label: t("terminal.gitBash", "Git Bash"),
      icon: GitBranch,
    },
  ];

  return (
    <ServiceWorkspaceLayout
      tabs={tabs}
      header={
        <ServiceWorkspaceHeader
          icon={SquareTerminal}
          title={t("navigation.terminal", "Terminal")}
          description={t(
            "pages.terminal.description",
            "Open shells, PHP CLI, MySQL CLI, and more.",
          )}
        />
      }
    />
  );
}

export default TerminalLayout;
