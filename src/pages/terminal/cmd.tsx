import { useId } from "react";
import { TerminalPanel } from "@/components/terminal-panel";

export function TerminalCmdPage() {
  const id = useId();
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 480 }}>
      <TerminalPanel
        sessionId={`cmd-${id}`}
        initialCommand="cmd"
        className="h-full"
      />
    </div>
  );
}

export default TerminalCmdPage;
