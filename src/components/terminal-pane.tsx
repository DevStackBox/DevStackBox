/**
 * TerminalPane
 *
 * A single xterm instance backed by a Rust pty session.
 * Rendered once per tab - hidden via CSS (display:none) when inactive,
 * NEVER unmounted while the tab is alive. This preserves the live pty
 * session, scrollback buffer, and process state across tab switches and
 * navigation away from /terminal.
 *
 * Cleanup on unmount (tab close):
 *  - inputDisposable.dispose()  → stop forwarding keystrokes
 *  - unlisten()                 → stop receiving terminal-output events
 *  - resizeObserver.disconnect()
 *  - kill_terminal_session      → kill Rust pty process
 *  - term.dispose()             → release xterm canvas / WebGL context
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  sessionId: string;
  initialCommand: string | null;
  isActive: boolean;
  /**
   * Called once when the xterm instance is ready.
   * Receives a `clearFn` that clears the terminal scrollback.
   * Returns an optional cleanup function.
   */
  onMount?: (clearFn: () => void) => (() => void) | void;
}

export function TerminalPane({
  sessionId,
  initialCommand,
  isActive,
  onMount,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  // Stub for future terminal-process-changed events (tab indicators / dynamic titles)
  const unlistenProcessRef = useRef<UnlistenFn | null>(null);
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const syncTerminalSize = (term: Terminal) => {
    if (!isTauri()) return;
    void safeInvoke(TAURI_COMMANDS.terminal.resize, {
      session_id: sessionId,
      cols: term.cols,
      rows: term.rows,
    });
  };

  const fitAndSync = (term: Terminal, fitAddon: FitAddon) => {
    fitAddon.fit();
    syncTerminalSize(term);
  };

  // ── Mount xterm once ────────────────────────────────────────────────────
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

    // Register the imperative clear function with the parent page
    const clearFn = () => term.clear();
    const onMountCleanup = onMount?.(clearFn);

    if (!isTauri()) {
      term.writeln("\x1b[33m[Browser mode - terminal unavailable]\x1b[0m");
      return;
    }

    let cancelled = false;
    let initTimer: ReturnType<typeof setTimeout>;

    const setupTerminal = async () => {
      // 1. Wait a moment for React/DOM layout to settle so xterm has real dimensions
      await new Promise((resolve) => {
        initTimer = setTimeout(resolve, 50);
      });
      if (cancelled) return;

      fitAddon.fit();

      // 2. Register listeners and await them BEFORE spawning
      const unlistenOutput = await listen<{ session_id: string; data: string }>(
        "terminal-output",
        (event) => {
          if (event.payload.session_id === sessionId) {
            term.write(event.payload.data);
          }
        },
      );
      if (cancelled) {
        unlistenOutput();
        return;
      }
      unlistenOutputRef.current = unlistenOutput;

      const unlistenProcess = await listen<{
        session_id: string;
        process: string;
      }>("terminal-process-changed", (_event) => {});
      if (cancelled) {
        unlistenProcess();
        return;
      }
      unlistenProcessRef.current = unlistenProcess;

      // 3. Forward keystrokes to Rust pty
      inputDisposable = term.onData((data) => {
        void safeInvoke(TAURI_COMMANDS.terminal.sendInput, {
          session_id: sessionId,
          data,
        });
      });

      // 4. Spawn the Rust pty session safely
      await safeInvoke(TAURI_COMMANDS.terminal.spawn, {
        session_id: sessionId,
        initial_command: initialCommand ?? null,
      });

      // 5. Sync PTY size after spawn so the shell matches xterm dimensions
      fitAndSync(term, fitAddon);
    };

    let inputDisposable: { dispose: () => void } | null = null;
    void setupTerminal();

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      onMountCleanup?.();
      inputDisposable?.dispose();
      unlistenOutputRef.current?.();
      unlistenProcessRef.current?.();
      void safeInvoke(TAURI_COMMANDS.terminal.kill, {
        session_id: sessionId,
      });
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── ResizeObserver - active-only fitting ─────────────────────────────────
  // Registered on every TerminalPane. Guards with isActive before calling
  // fitAddon.fit() so hidden panes (display:none) can't corrupt dimensions.
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (isActive && fitAddonRef.current && termRef.current) {
        fitAndSync(termRef.current, fitAddonRef.current);
      }
    });
    observer.observe(containerRef.current);

    // When THIS pane becomes active, fit immediately to catch any resize
    // that happened while the tab was hidden.
    if (isActive && fitAddonRef.current && termRef.current) {
      fitAndSync(termRef.current, fitAddonRef.current);
      termRef.current.focus();
    }

    return () => observer.disconnect();
  }, [isActive, sessionId]);

  return (
    <div
      style={{
        display: isActive ? "flex" : "none",
        height: "100%",
        width: "100%",
        flexDirection: "column",
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
