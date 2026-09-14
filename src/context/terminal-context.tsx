/**
 * TerminalContext - tab state for in-app terminals.
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

export interface TerminalTab {
  id: string;
  shellType: ShellType;
  title: string;
  createdAt: number;
}

export interface TerminalContextValue {
  tabs: TerminalTab[];
  activeTabId: string | null;
  canCreateTab: boolean;
  createTab: (shellType: ShellType) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
}

export const MAX_TABS = 10;

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: ReactNode }) {
  const countersRef = useRef<Record<string, number>>({});

  const buildTab = useCallback((shellType: ShellType): TerminalTab => {
    const count = (countersRef.current[shellType.id] ?? 0) + 1;
    countersRef.current[shellType.id] = count;
    return {
      id: crypto.randomUUID(),
      shellType,
      title: `${shellType.label} ${count}`,
      createdAt: Date.now(),
    };
  }, []);

  const initialTab = buildTab(DEFAULT_SHELL);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [initialTab]);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => initialTab.id,
  );

  const canCreateTab = useMemo(() => tabs.length < MAX_TABS, [tabs.length]);

  const createTab = useCallback(
    (shellType: ShellType) => {
      if (tabs.length >= MAX_TABS) return;
      const tab = buildTab(shellType);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    [buildTab, tabs.length],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        let next = prev.filter((t) => t.id !== tabId);
        if (next.length === 0) {
          const newTab = buildTab(DEFAULT_SHELL);
          setActiveTabId(newTab.id);
          return [newTab];
        }
        setActiveTabId((current) => {
          if (current !== tabId) return current;
          return next[Math.min(idx, next.length - 1)]?.id ?? null;
        });
        return next;
      });
    },
    [buildTab],
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        tabs,
        activeTabId,
        canCreateTab,
        createTab,
        closeTab,
        switchTab,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminal must be used inside <TerminalProvider>");
  }
  return ctx;
}
