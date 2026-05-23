import { useId } from "react";
import { TerminalPanel } from "@/components/terminal-panel";

export function TerminalMysqlPage() {
  const id = useId();
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 480 }}>
      <TerminalPanel
        sessionId={`mysql-cli-${id}`}
        initialCommand="mysql -u root"
        className="h-full"
      />
    </div>
  );
}

export default TerminalMysqlPage;
