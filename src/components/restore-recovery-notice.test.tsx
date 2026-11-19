import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { RestoreRecoveryNotice } from "./restore-recovery-notice";
import { TAURI_COMMANDS } from "@/lib/commands";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ safeInvoke: mocks.invoke, isTauri: () => true }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); root = createRoot(host); mocks.invoke.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("makes interrupted recovery discoverable without invoking restore or deleting records", async () => {
  mocks.invoke.mockResolvedValue(["restore-interrupted.recovery.json"]);
  await act(async () => root.render(<RestoreRecoveryNotice />));
  expect(host.textContent).toContain("SQL may have partially applied");
  expect(mocks.invoke.mock.calls).toEqual([[TAURI_COMMANDS.backup.listRecovery]]);
  await act(async () => host.querySelector('button')!.click());
  expect(mocks.invoke.mock.calls).toEqual([[TAURI_COMMANDS.backup.listRecovery], [TAURI_COMMANDS.backup.openFolder]]);
});
it("does not claim a clean recovery state when discovery fails", async () => {
  mocks.invoke.mockRejectedValue(new Error("denied"));
  await act(async () => root.render(<RestoreRecoveryNotice />));
  expect(host.textContent).toContain("Could not check restore recovery records");
});
it("shows no recovery alert when no interrupted records exist", async () => {
  mocks.invoke.mockResolvedValue([]);
  await act(async () => root.render(<RestoreRecoveryNotice />));
  expect(host.textContent).toBe("");
});
