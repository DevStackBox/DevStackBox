import { describe, expect, it } from "vitest";
import { bulkServiceActions } from "./service-actions";
import type { ServiceStatus } from "@/types/services";

const running: ServiceStatus = { state: "running", running: true };
const stopped: ServiceStatus = { state: "stopped", running: false };

describe("bulk service action availability", () => {
  it.each([
    [running, running, false, true],
    [stopped, stopped, true, false],
    [running, stopped, true, true],
    [stopped, running, true, true],
  ])("matches Apache %j and MySQL %j", (apache, mysql, canStart, canStop) => {
    expect(bulkServiceActions({ apache, mysql }, false, false)).toEqual({ canStart, canStop, canRestart: canStop });
  });

  it.each(["starting", "stopping"] as const)("blocks actions during %s even without a local pending action", state => {
    expect(bulkServiceActions({ apache: { ...running, state }, mysql: stopped }, false, false))
      .toEqual({ canStart: false, canStop: false, canRestart: false });
  });

  it.each([[true, false], [false, true]])("blocks actions while status is loading or a command is pending", (initialLoading, busy) => {
    expect(bulkServiceActions({ apache: running, mysql: stopped }, initialLoading, busy))
      .toEqual({ canStart: false, canStop: false, canRestart: false });
  });
});
