import { useId } from "react";
import { TerminalPanel } from "@/components/terminal-panel";

export function TerminalPhpPage() {
  const id = useId();
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 480 }}>
      <TerminalPanel
        sessionId={`php-cli-${id}`}
        initialCommand="php -a"
        className="h-full"
      />
    </div>
  );
}

export default TerminalPhpPage;
