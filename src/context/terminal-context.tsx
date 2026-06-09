/**
 * TerminalContext
 *
 * Single source of truth for all terminal tab state.
 * Lives at the app root — never unmounts, so sessions survive navigation.
 *
 * Rules:
 *  - Tab state is NOT persisted to localStorage (pty sessions don't survive
 *    app restart; a fresh Shell tab on every launch is expected behavior).
 *  - canCreateTab is a derived useMemo — consumers never re-derive it.
 *  - Tab title numbering is MONOTONIC per shell type. Opening Shell 1, 2, 3,
 *    closing Shell 2, then opening a new Shell → Shell 4 (never reuses gaps).
 *  - When the last tab is closed, a new Shell tab is automatically opened.
 *  - MAX_TABS = 10.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SHELL, type ShellType } from "@/lib/shell-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalTab {
  /** crypto.randomUUID() — also used as the Rust pty session_id */
  id: string;
  shellType: ShellType;
  /** Monotonic title: "Shell 1", "PHP Interactive 3" */
  title: string;
  createdAt: number;
}

export interface TerminalContextValue {
  tabs: TerminalTab[];
  activeTabId: string | null;
  /** false when tabs.length >= MAX_TABS (derived, never re-compute in consumers) */
  canCreateTab: boolean;
  createTab: (shellType: ShellType) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
}

export const MAX_TABS = 10;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TerminalContext = createContext<TerminalContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TerminalProvider({ children }: { children: ReactNode }) {
  // Monotonic counter per shell type — never decremented, never reused
  const countersRef = useRef<Record<string, number>>({});

  const makeTitle = (shellType: ShellType): string => {
    const count = (countersRef.current[shellType.id] ?? 0) + 1;
    countersRef.current[shellType.id] = count;
    return `${shellType.label} ${count}`;
  };

  const makeTab = (shellType: ShellType): TerminalTab => ({
    id: crypto.randomUUID(),
    shellType,
    title: makeTitle(shellType),
    createdAt: Date.now(),
  });

  // Open with one Shell tab by default
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [makeTab(DEFAULT_SHELL)]);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => tabs[0]?.id ?? null,
  );

  const canCreateTab = useMemo(() => tabs.length < MAX_TABS, [tabs.length]);

  // ---------------------------------------------------------------------------

  const createTab = useCallback(
    (shellType: ShellType) => {
      if (tabs.length >= MAX_TABS) return;
      const tab = makeTab(shellType);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs.length],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);

        if (next.length === 0) {
          // Auto-open a new Shell tab so there's always at least one
          const newTab = makeTab(DEFAULT_SHELL);
          setActiveTabId(newTab.id);
          return [newTab];
        }

        // If we just closed the active tab, switch to the neighbour
        setActiveTabId((current) => {
          if (current !== tabId) return current;
          const idx = prev.findIndex((t) => t.id === tabId);
          const neighbour = next[Math.min(idx, next.length - 1)];
          return neighbour?.id ?? null;
        });

        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // ---------------------------------------------------------------------------

  return (
    <TerminalContext.Provider
      value={{ tabs, activeTabId, canCreateTab, createTab, closeTab, switchTab }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminal must be used inside <TerminalProvider>");
  }
  return ctx;
}
