# Production readiness audit - 5 November 2026

## Decision and scope

**Not ready for an unconditional production-readiness sign-off.** Source version is 0.1.22, not the 0.1.17 stated in the supplied brief. This is an audit-only review: no remediation, release publication or installer upgrade was performed. No P0 exploit was confirmed.

This report covers repository discovery, focused security/correctness review and executed automated checks. It is not a claim that every native command was exhaustively proved safe. Installed-app visual, accessibility, display-scaling, upgrade/uninstall and large-data performance qualification remain outstanding. Earlier screenshots and audit results do not qualify this revision.

## Architecture and trust boundaries

- React 18/Vite/TypeScript frontend: `src/main.tsx`, `src/App.tsx`, route pages and shared UI components. `safeInvoke` calls registered Tauri commands. Session command/workspace caches deduplicate reads and invalidate on mutations; live services/logs use separate observers.
- Rust/Tauri 2: `src-tauri/src/lib.rs` registers commands and startup/window-close handling. `commands` implements service, project, database, configuration, security, terminal, updater and backup operations. Main-window capabilities and a restrictive CSP limit the webview surface; native command validation remains essential.
- Apache/MySQL are bundled native processes; PHP is a runtime selected globally or per project. Process probes distinguish owned servers from short-lived configuration probes. Project diagnostics use bounded HTTP requests.
- MySQL commands use bundled clients, explicit TCP/127.0.0.1, configured ports and a datadir ownership check. SQL helpers validate names, protect system schemas/accounts and send SQL through stdin. Root credentials use Windows DPAPI; child clients receive credentials through their environment.
- Database workspace operations validate requests, stream SQL, bound decompression, maintain per-item history and support cancellation. SQL import is intentionally not transactional; partial changes are possible. Export publication uses temporary output and checks success before publishing.
- Full backup is a separate pipeline: ZIP configuration/default web-root files plus a streamed database dump. Restore validates entries, creates a recovery backup, stops Apache, imports SQL, then overwrites configuration/web files. It is not an atomic restore.
- Terminal commands create interactive shells; arbitrary shell execution is an intended feature. Terminal and backup outputs may contain private project data and require local handling.
- Updater checks fixed GitHub endpoints through the Tauri updater plugin and configured public key. Updater signatures and Windows publisher signing are separate; Authenticode is unconfigured in `tauri.conf.json`.
- Shutdown guards consult database operation state. Their coverage does not encompass every full-backup phase (F01).

## Prioritized findings and remediation plan

All findings below are identified, not implemented. Static reproduction scenarios are distinguished from executed integration tests.

### F01 - P1: Full-backup lifecycle is outside comprehensive operation protection

Evidence: `commands/fullbackup.rs:create_full_backup` performs filesystem compression and mysqldump without `MYSQL_DATA_LOCK` or a shared active-job registration. `restore_full_backup` holds the database lock only around SQL import. `commands/tray.rs:quit_app` and the close handler rely on `database_workspace::has_active_database_operation`, which checks the database lock/job registry.

Impact: full-backup creation and the file-restoration phase are not reliably covered by exit/service-operation guards. Concurrent changes can undermine recovery consistency; exit can interrupt file replacement. This interleaving is source-confirmed; forced-exit data-loss reproduction was not run.

Reproduce safely: use an isolated profile with a large web root, begin full backup/restore, and attempt Quit/service stop during each phase. Verify recovery consistency after interruption.

Fix: introduce shared operation ownership for the entire lifecycle, safe exit handling and staged file restoration. Define lock ordering before nesting recovery-backup creation. Verify concurrency, cancellation, disk failure and restart recovery with disposable fixtures.

### F02 - P1: Full-restore archive resource limits are incomplete

Evidence: `commands/fullbackup.rs:restore_full_backup` reads `manifest.json` into an unbounded String before checking entry sizes. It checks individual entries against 16 GiB, but has no aggregate decompressed-byte or entry-count budget. The integrity scan decompresses every entry, including otherwise ignored paths.

Impact: malformed or unusually large backups can exhaust memory, disk or processing time. The database workspace's separate archive limits do not protect this command. No malicious large archive was executed.

Reproduce: bounded disposable ZIP fixtures with an oversized manifest, many entries and excessive aggregate expansion. Expect rejection before recovery backup or user-file writes.

Fix: cap manifest bytes before allocation, enforce entry-count/aggregate/streamed-byte limits and reject unsupported entries. Add cancellation and staging. Verify rejection leaves destination files untouched.

### F03 - P2: Metadata queries have no execution deadline or output bound

Evidence: `utils/database_io.rs:query` uses `wait_with_output()` and `mysql_connection.rs:verify_mysql_datadir` uses `.output()` without a timeout. The “Bounded process IO” module comment overstates guarantees for queries.

Impact: a hung client/query can retain workers and leave loading states unresolved; output is accumulated in memory. This is not evidence of a measured UI freeze.

Fix: bounded readers and explicit deadlines with kill/reap cleanup. Verify stalled fake clients and large output, plus recovery after timeout.

### F04 - P2: Beta channel is pinned to one historical release

Evidence: `commands/app_update.rs:BETA_ENDPOINT` hardcodes `/releases/download/v0.1.9-beta/latest.json`; Settings exposes beta selection.

Impact: selecting beta cannot discover later beta manifests at other release tags. Current endpoint availability was not tested.

Fix: use a maintained beta manifest location or remove the unsupported channel choice. Test newer/no-update/error cases and signed artifact verification.

### F05 - P2: XAMPP copy recursively follows directory links

Evidence: `commands/migration.rs:copy_tree` recurses through `Path::is_dir()` without inspecting symlink/reparse metadata or tracking visited directories.

Impact: a junction cycle can recurse indefinitely; linked directories can copy data outside the selected source tree. No actual XAMPP data was copied during this audit.

Fix: explicitly reject or report links before descent; define bounded traversal. Verify a disposable junction cycle, external-directory link and ordinary nested tree.

### F06 - P2: Full restore exposes raw MySQL diagnostics

Evidence: `commands/fullbackup.rs` interpolates full MySQL stderr into restore errors, unlike the database workspace diagnostic sanitizer.

Impact: SQL errors can include data literals that reach UI/diagnostic capture. No real secret was exposed during testing.

Fix: reuse sanitized numeric/category/line diagnostics; test malformed SQL containing synthetic private values.

### F07 - P1 triage: Dependency advisories require exposure assessment

`npm audit --omit=dev --json` reported four moderate affected dependency entries and zero high/critical entries. Raw local evidence: `review-artifacts/audit-npm-2026-11-05.json`. Advisory chains include glob/minimatch/sucrase. These are scanner matches, not demonstrated runtime exploits, and may share underlying advisories. Trace actual shipped/build exposure before choosing upgrades. Re-run tests and packaging after lockfile changes. Rust advisory scanning is unavailable because cargo-audit is not installed.

The full audit including development dependencies reports 13 affected entries: eight high and five moderate, zero critical. These include Vite, undici and TypeScript ESLint dependency chains. Evidence: `review-artifacts/audit-npm-full-2026-11-05.json`. High scanner severity warrants prompt build/development exposure assessment, but does not prove eight independently exploitable shipped-app vulnerabilities.

### F08 - P2: Release qualification is incomplete

`tauri.conf.json` has no publisher certificate configuration. Release-input validation is not an installation, upgrade, uninstall or signature verification of a newly built installer. Complete disposable-machine install/upgrade/uninstall and recovery tests; separately decide publisher-signing policy. Do not change signing credentials during audit.

### F09 - P3: Documentation and formatting drift

`docs/development/architecture.mdx` still describes removed system-tray helpers/hooks and says shared UI components must not be modified. Its file map is not a reliable exact inventory. `cargo fmt -- --check` reports formatting differences. Update documentation against source; apply formatting as a separate reviewable change. Documentation navigation validation does not establish factual accuracy.

### F10 - P3: Frontend bundle size warrants measurement

Vite reports a 3,941.89 kB main JavaScript chunk (1,059.09 kB gzip). Build completed in 17.52 seconds. Measure cold start and page transitions before deciding on route/editor splitting. Bundle size alone does not establish a user-visible performance defect.

## UI/UX and feature coverage

Automated coverage validates 31 documented screens and nine additional flows, with 40 published MDX pages. Frontend tests cover cache races, service state, project diagnostics, HTTPS workflows, updater progress and database transfer behavior. This does not substitute for checking every screen interactively.

Required native review matrix: Dashboard; all Apache/MySQL/PHP tabs; Projects/details; database list/details/users/import/export/backups/activity; Terminal; Security; Settings/backup/migration; About; Logs/archives. Exercise light/dark, English/Hindi, 900×640 minimum, typical/maximized windows, keyboard-only navigation, zoom/scaling, empty/loading/error states and destructive confirmations.

Do not infer feature presence from the brief: native database rename and direct remote server transfer need explicit product decisions and validation; they are not automatically mandatory missing features. The current Import & Export label covers implemented dump workflows.

## Verification evidence

Executed on this Windows checkout, version 0.1.22:

| Check                                       | Result                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:ci`                          | Passed: 86 frontend tests, TypeScript, docs validation (40 pages, 31 screens, nine flows). Error-boundary test intentionally emits an error stack.                                        |
| `cargo test --lib`                          | 65 passed, two isolated database tests ignored by default.                                                                                                                                |
| `scripts/test-database-workspace.ps1`       | Passed `native_workspace_round_trip` against a new disposable MySQL profile; includes grants, import/export, partial failure and cancellation checks. External user-ZIP test was not run. |
| `npx vite build`                            | Passed; large-chunk/mixed-import warnings remain. This bypasses npm prebuild.                                                                                                             |
| `npm run test:packaging`                    | Three passed.                                                                                                                                                                             |
| `node scripts/test-apache-overrides.mjs`    | Passed real Apache fixture: public rewrites/assets work, private parent file inaccessible.                                                                                                |
| `cargo clippy --all-targets -- -D warnings` | Passed.                                                                                                                                                                                   |
| `cargo fmt -- --check`                      | Failed: formatting drift.                                                                                                                                                                 |
| `node scripts/verify-release.mjs`           | Passed v0.1.22 release inputs; staged phpMyAdmin and built PHP launcher as part of validation.                                                                                            |
| Production npm dependency audit             | Four moderate affected entries; nonzero audit status is expected.                                                                                                                         |
| Full npm dependency audit                   | 13 affected entries: eight high, five moderate; requires exposure triage.                                                                                                                 |
| Rust dependency advisory audit              | Not run: cargo-audit unavailable.                                                                                                                                                         |

No new installer was built/installed. Native screen-reader/keyboard/scaling review, current screenshot review, peak CPU/RAM, large-database performance and interrupted-upgrade tests were not performed. Full command-by-command IPC review and bundled Apache/MySQL/PHP/phpMyAdmin advisory matching remain required. The report is a scoped audit with an explicit remaining checklist, not a complete security certification.

## Execution order and sign-off checklist

1. Resolve F01/F02 with disposable recovery tests; protect user data before UI polish.
2. Resolve F03/F05/F06 and verify process, traversal and privacy failure paths.
3. Resolve beta-channel behavior; triage dependency matches and bundled runtime advisories.
4. Complete native UX/accessibility and performance matrix; record reproducible findings rather than guessed defects.
5. Correct docs/formatting; run existing checks and new targeted regressions.
6. Build the exact release candidate, verify signatures and qualify clean install, upgrade, uninstall and interruption recovery.
7. Sign off only when high-risk findings are resolved and remaining limitations are explicitly accepted.
