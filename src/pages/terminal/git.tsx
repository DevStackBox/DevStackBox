import { useId } from "react";
import { TerminalPanel } from "@/components/terminal-panel";

export function TerminalGitPage() {
  const id = useId();
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 480 }}>
      <TerminalPanel
        sessionId={`git-${id}`}
        initialCommand="bash"
        className="h-full"
      />
    </div>
  );
}

export default TerminalGitPage;
