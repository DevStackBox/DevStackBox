import { useId } from "react";
import { TerminalPanel } from "@/components/terminal-panel";

export function TerminalShellPage() {
  const id = useId();
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 480 }}>
      <TerminalPanel sessionId={`shell-${id}`} className="h-full" />
    </div>
  );
}

export default TerminalShellPage;
