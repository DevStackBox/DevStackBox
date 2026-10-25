# Database workspace implementation and visual audit

Date: 2026-10-25. Status: shipped in v0.1.18.

## Native visual audit

Inspected the compiled Windows app in a separate `DevStackBox Database Preview` profile with disposable MySQL data on port 57193. No production database was used for these operations.

| Surface | Result |
| --- | --- |
| Database list | Summary, search, selection and visible Manage/Backup actions fit the desktop viewport. |
| Database details | Character set, collation, estimated size and separate table/view counts are visible. |
| Tables & Views | Search and object types are clearly separated; view row estimates display a dash. |
| Export | Database preselection, content/format controls and managed backup action render correctly. The longer page scrolls vertically. |
| Import | Empty state and existing-target review are clear; execution remains disabled without acknowledgement. Long file paths wrap. |
| Activity | A real demonstration backup completed and appears with its database, timestamp, bytes and file action. |
| Saved backups | Filtered backup metadata renders; a real integrity check changed the status to “Checksum matches” while preserving “Restore not verified.” |
| Users | Actions are labelled; system account deletion and permissions controls are disabled. |
| Database permissions | Database picker, privilege presets, explicit privileges and change summary render in a scrollable dialog. Inspected without applying changes. |
| MySQL stopped | Live management is replaced by a stopped-state panel with recovery actions and explicitly stale cached database names. Verified by shutting down only the disposable server. |
| Dark appearance | Stopped-state content and navigation remain readable. |

No blocking layout defect was observed in these inspected desktop states. This is not an exhaustive accessibility, localization, minimum-window-size or all-dialog audit. Credential changes and destructive actions were not submitted through the GUI during this visual pass; backend and workflow tests provide separate evidence.

## Screenshot provenance

Eleven captures are recorded in `docs/images/screenshots.json` and preserved byte-for-byte as JPEGs in `docs/images/source-preview/`, dated 2026-10-25. The capture API supplied **1536 × 912** images, not 1920-pixel Full HD. They were not resized, upscaled, recompressed or converted to PNG. A future 1920-pixel capture remains an optional media-quality improvement.

The database and backup guides use these captures with explicit unreleased-source captions. The sidebar version is the unchanged package version, not evidence that the published v0.1.17 contains these features. Older screenshots remain beside the historical release instructions.

## Delivered scope and boundaries

Implemented the three-tab workspace, details, SQL/GZIP/ZIP import/export, sequential batches, native operation history and cancellation, managed backup records, integrity checks, reviewed restoration, full-server backup, account controls and direct database-grant editing.

Copy/migration, remote transfer and account rename remain deferred. Permission editing is per database; advanced grants are preserved rather than presented as a complete effective-access report. Account creation and granting access are separate. No password generator or automated restore-verification workflow is provided. Legacy backup files remain accessible through legacy tools and do not acquire new activity records retroactively. Import progress reports state rather than an invented completion percentage. Arbitrary SQL is never confined by the initial-target selector.

## Verification

- Frontend: 45 tests passed across 9 files; TypeScript passed.
- Rust: 50 tests passed; the disposable-server integration test is intentionally ignored in the ordinary suite and was run separately through `scripts/test-database-workspace.ps1` during implementation.
- Native integration evidence includes SQL/GZIP round trips, stored objects, full-server export, ZIP validation, exact database grant scope, sequential failure handling, partial import and cancellation.
- Documentation: 39 MDX pages, 39 navigation slugs, 30 screen entries and 9 non-route flows validated.
- Website: 6 tests passed, including byte/dimension preservation; production build generated 61 pages and copied 27 approved screenshots.
- HTTP smoke checks passed for 52 public/docs pages, headings, canonical links, internal anchors, image assets, 404 handling, sitemap and search.
- Website browser visual inspection could not run because local browser use is disabled in Work settings. Build and HTTP checks are separate evidence, not a substitute for a visual browser review.

No release, version bump, deployment or commit was made as part of this audit.

The disposable MySQL server and native preview app were stopped after inspection. The test profile and evidence remain in ignored `review-artifacts/`; published documentation screenshots are tracked separately.
