import { describe, expect, it } from "vitest";
import {
  computeDownloadProgress,
  isTransientUpdaterError,
} from "./updater-progress";

describe("computeDownloadProgress", () => {
  it("starts at 0% with known total", () => {
    expect(computeDownloadProgress(0, 1000)).toEqual({
      percent: 0,
      indeterminate: false,
      phase: "downloading",
    });
  });

  it("tracks percentage from Started contentLength and Progress chunks", () => {
    expect(computeDownloadProgress(400, 1000)).toEqual({
      percent: 40,
      indeterminate: false,
      phase: "downloading",
    });
    expect(computeDownloadProgress(600, 1000)).toEqual({
      percent: 60,
      indeterminate: false,
      phase: "downloading",
    });
  });

  it("caps at 99% until Finished and switches to installing when bytes complete", () => {
    expect(computeDownloadProgress(1000, 1000)).toEqual({
      percent: 99,
      indeterminate: false,
      phase: "installing",
    });
    expect(computeDownloadProgress(1500, 1000)).toEqual({
      percent: 99,
      indeterminate: false,
      phase: "installing",
    });
  });

  it("uses indeterminate mode when content length is unknown", () => {
    expect(computeDownloadProgress(0, 0)).toEqual({
      percent: 0,
      indeterminate: false,
      phase: "downloading",
    });
    expect(computeDownloadProgress(4096, 0)).toEqual({
      percent: 0,
      indeterminate: true,
      phase: "downloading",
    });
  });
});

describe("isTransientUpdaterError", () => {
  it("detects network-style failures", () => {
    expect(isTransientUpdaterError(new Error("Network error: connection reset"))).toBe(
      true,
    );
    expect(isTransientUpdaterError("Download request failed with status: 503")).toBe(
      true,
    );
    expect(isTransientUpdaterError(new Error("Invalid signature"))).toBe(false);
  });
});
