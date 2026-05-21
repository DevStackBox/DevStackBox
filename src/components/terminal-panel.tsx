import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  sessionId: string;
  initialCommand?: string;
  className?: string;
}

export function TerminalPanel({
  sessionId,
  initialCommand,
  className = "",
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const writeToTerm = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, 'Courier New', monospace",
      theme: isDark
        ? {
            background: "#09090b",
            foreground: "#e4e4e7",
            cursor: "#e4e4e7",
            selectionBackground: "#3f3f46",
          }
        : {
            background: "#ffffff",
            foreground: "#18181b",
            cursor: "#18181b",
            selectionBackground: "#d4d4d8",
          },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (!isTauri()) {
      term.writeln("\x1b[33m[Browser mode - terminal unavailable]\x1b[0m");
      return;
    }

    // Listen for output from the backend.
    let cancelled = false;
    listen<{ session_id: string; data: string }>("terminal-output", (event) => {
      if (event.payload.session_id === sessionId) {
        writeToTerm(event.payload.data);
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });

    // Forward keystrokes to the backend.
    const disposable = term.onData((data) => {
      safeInvoke(TAURI_COMMANDS.terminal.sendInput, {
        session_id: sessionId,
        data,
      });
    });

    // Spawn the backend shell.
    safeInvoke(TAURI_COMMANDS.terminal.spawn, {
      session_id: sessionId,
      initial_command: initialCommand ?? null,
    });

    // Refit when container resizes.
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      disposable.dispose();
      unlistenRef.current?.();
      observer.disconnect();
      safeInvoke(TAURI_COMMANDS.terminal.kill, { session_id: sessionId });
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full rounded-md overflow-hidden ${className}`}
      style={{ minHeight: 320 }}
    />
  );
}
