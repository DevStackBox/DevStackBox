import { describe, expect, it } from "vitest";
import {
  formatUpdateReleaseNotes,
  isUpdaterProgressIndeterminate,
  primaryButtonLabelKey,
  shouldShowDownloadPercent,
} from "./updater-ui";

describe("shouldShowDownloadPercent", () => {
  it("hides percent while preparing", () => {
    expect(
      shouldShowDownloadPercent("preparing", false, true),
    ).toBe(false);
  });

  it("hides percent when indeterminate", () => {
    expect(
      shouldShowDownloadPercent("downloading", true, true),
    ).toBe(false);
  });

  it("shows percent during determinate download", () => {
    expect(
      shouldShowDownloadPercent("downloading", false, true),
    ).toBe(true);
  });
});

describe("isUpdaterProgressIndeterminate", () => {
  it("treats preparing as indeterminate", () => {
    expect(isUpdaterProgressIndeterminate("preparing", false)).toBe(true);
  });
});

describe("primaryButtonLabelKey", () => {
  it("uses short preparing label while downloading", () => {
    expect(
      primaryButtonLabelKey({
        downloading: true,
        readyToInstall: false,
        checkError: null,
        phase: "preparing",
        indeterminate: true,
        downloadRetryAttempt: 0,
      }),
    ).toBe("updater.preparingShort");
  });

  it("uses restart when ready to install", () => {
    expect(
      primaryButtonLabelKey({
        downloading: true,
        readyToInstall: true,
        checkError: null,
        phase: "installing",
        indeterminate: false,
        downloadRetryAttempt: 0,
      }),
    ).toBe("updater.restartAndUpdate");
  });
});

describe("formatUpdateReleaseNotes", () => {
  it("strips markdown headings for wrapping display", () => {
    expect(formatUpdateReleaseNotes("### Removed\n- item")).toBe(
      "Removed\n- item",
    );
  });
});
