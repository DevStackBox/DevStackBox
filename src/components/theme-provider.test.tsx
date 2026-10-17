import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

describe("Windows appearance", () => {
  it("follows system changes and preserves an explicit user preference", async () => {
    localStorage.clear();
    let change: (() => void) | undefined;
    const query = { matches: false, addEventListener: (_: string, fn: () => void) => { change = fn; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => query);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    function Controls() { const theme = useTheme(); return <button onClick={() => theme.setTheme("light")}>{theme.resolvedTheme}</button>; }
    const host = document.createElement("div"); const root = createRoot(host);
    await act(async () => root.render(<ThemeProvider defaultTheme="system"><Controls /></ThemeProvider>));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    await act(async () => { query.matches = true; change?.(); });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => host.querySelector("button")!.click());
    expect(localStorage.getItem("devstackbox-ui-theme")).toBe("light");
    await act(async () => { query.matches = false; change?.(); query.matches = true; change?.(); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    await act(async () => root.unmount());
    expect(query.removeEventListener).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
