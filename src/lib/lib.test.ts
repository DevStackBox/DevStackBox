import { describe, expect, it, vi, beforeEach } from "vitest";
import { formatBytes } from "./utils";

describe("formatBytes", () => {
  it("formats zero and small values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toContain("B");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toMatch(/MB|1/);
  });
});

describe("safeInvoke", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null in browser mode", async () => {
    const { safeInvoke } = await import("./tauri");
    const result = await safeInvoke("any_command");
    expect(result).toBeNull();
  });
});
