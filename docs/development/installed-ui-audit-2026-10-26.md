# Installed desktop audit - 26 October 2026

Version: 0.1.18, local production build. No release or website deployment was performed.

## Method

Built the Tauri/NSIS installer with updater artifacts disabled for this local test. Upgraded the existing `C:/devstackbox` installation. Exercised the installed executable with a disposable data profile and synthetic logs; user databases and real log contents were not cleared. Screenshots and verification records are kept locally in `review-artifacts/installed-audit-2026-10-26/` (ignored by Git).

## Verified behavior

- The installer returned exit code 0. All 13 tracked configuration files were unchanged immediately after the upgrade, including phpMyAdmin configuration.
- The installed phpMyAdmin themes directory contains only `pmahomme`. The upstream source tree remains intact.
- Dashboard with both services stopped enables Start All and disables Stop All. Automated tests cover the other service-state combinations.
- Clear view leaves the file intact, keeps old lines hidden across refreshes, and displays subsequent appended lines.
- Archive current log preserved all 196 synthetic bytes in a verified GZIP and emptied the active file. Archive preview displayed all three entries; export saved the complete compressed archive through the native Save dialog.
- Delete log contents opened a typed-confirmation dialog with its destructive action disabled until confirmation. The dialog was canceled. Actual deletion and archive integrity are covered by native tests.
- Rotation settings showed the disabled default policy and saved successfully in the disposable profile.
- Project Details uses the available content width. Project wording describes accessible folders outside the default `www` directory.
- About displays the author link, and the sidebar displays Built with Love with a red heart icon. About layout was inspected in light and dark themes.

## Corrections found during the audit

The log action buttons were below the tall viewer. They were moved above it so Clear view, history, archive and delete are immediately accessible. Clearing also incorrectly reported omitted history; the native response now excludes that warning for an intentional clear and the viewer explains that it is waiting for new entries.

The corrected production build was installed successfully and these fixes were verified at normal window size and maximized (1920 × 1032). Services were also observed running with Start All disabled, then stopped through Stop All; Stop All became disabled after shutdown. The final configuration comparison retained all original lines; phpMyAdmin gained only the expected conditional theme-policy include from runtime migration. A full-resolution log screenshot is included in the user guide.

## Automated checks

- 67 frontend tests across 13 files passed; TypeScript compilation passed.
- Native suite: 56 passed, one ignored; all six log-management tests passed again after the final clear-response correction.
- Three packaging checks passed.
- Documentation validation passed for 39 pages, 30 screens and nine non-route flows. Website build and six website tests passed.

## Scope limits

Automatic maintenance remains off by default. Apache, MySQL and PHP archival waits for stopped writers; live Apache piped logging and MySQL reopen-based rotation are not implemented. No user service is stopped automatically for rotation. The disposable profile deliberately has no trusted local CA, so its HTTPS warnings are expected and were not repaired. No full phpMyAdmin database-editing or language matrix, controlled installer-speed benchmark, or public release acceptance is claimed by this audit.
