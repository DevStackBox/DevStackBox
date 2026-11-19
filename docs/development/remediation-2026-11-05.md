# Backup foundation remediation - 5 November 2026

Scope: F01, F02, F03, F05, F06 implementation and F07 exposure triage. No database UI changes, dependency upgrades, release publication or signing changes.

## Changes and status

| Finding | Files                                               | Change and verification boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01     | commands/fullbackup.rs, apache.rs, mysql.rs; lib.rs | Full backup/restore owns the existing MYSQL_DATA_LOCK throughout, including recovery creation and file replacement. Existing close/tray guards observe that lock. Apache/MySQL start/stop reject competing operations; restore has an internal Apache-stop function requiring the held guard. Recovery creation does not recursively acquire locks. Lock/service regression passed. Abrupt process termination and full installed restore qualification remain open.                                                                       |
| F02     | commands/fullbackup.rs                              | Preflight limits: 64 KiB manifest, 100,000 entries, 16 GiB per file, 32 GiB aggregate. Streamed-byte limits and CRC reads precede service stops/recovery creation/SQL/file mutation. Duplicate case-insensitive paths, traversal, alternate data streams, link entries, unknown top-level content and manifest/database mismatch rejected. Windows archive handle denies concurrent writes/deletion. Native cancel_full_backup command checks copy loops and child processes. No cancellation button was added in this backend-only scope. |
| F03     | utils/database_io.rs, mysql_connection.rs           | Shared query and datadir probe: 30-second deadline, bounded stdout/stderr, kill/reap on timeout/overflow. Full-backup dump/import: cancellable one-hour ceiling with bounded diagnostics. Tests exercise timeout, overflow and cancellation with disposable child processes. This is not a claim that every subprocess elsewhere in the application now has a deadline.                                                                                                                                                                    |
| F05     | commands/migration.rs                               | Reject symlinks/reparse points at source root, every source entry and existing destination entry/root. Junction-cycle regression passed. Existing externally writable destination ancestors and concurrent link replacement need further hardening; traversal is not handle-relative.                                                                                                                                                                                                                                                      |
| F06     | commands/fullbackup.rs, database_workspace.rs       | Full-backup SQL failures reuse the existing sanitizer, preserving numeric error/line and fixed guidance while omitting raw literals. Existing synthetic-secret diagnostic regressions pass.                                                                                                                                                                                                                                                                                                                                                |
| F07     | Audit evidence and this report only                 | Dependency exposure triaged below; packages/lockfile unchanged. Advisory resolution remains open.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Lock order and scope

Full operations acquire SITE_LOCK, then the existing database-operation lock and configuration lock (backup acquires configuration before database; both paths serialize through SITE_LOCK). Recovery creation calls the internal already-owned routine. No second operation mutex was introduced. Cancellation is an atomic request flag, reset only after acquiring ownership.

Service controls now share database exclusivity, so even Apache controls may reject while a database operation is active. External SQL clients, external file editors, Windows termination and power loss cannot be prevented by this in-process lock. Installed close/updater termination paths still require end-to-end qualification; source lock tests do not certify every Windows exit route.

## Recovery behavior

1. Validate the entire archive and destination paths before modifying user files/databases or stopping Apache.
2. Stop Apache under operation ownership; create the recovery ZIP while the same operation lock remains held. A failure here leaves Apache stopped and the original data intact except for changes made by external clients.
3. Persist and sync `backups/full/restore-<timestamp>.recovery.json` before SQL/file application. It names the recovery ZIP and warns against automatic retry.
4. Apply SQL with explicit partial-application semantics. Restore each file through a unique sibling temporary file, sync it, then rename it into place. Read/write failure before rename preserves that destination file.
5. Remove the incomplete record only after every phase succeeds. Failure/interruption retains the recovery ZIP and record. Services remain stopped for review; do not blindly replay an import. Recover by inspecting partial state and explicitly restoring the recorded recovery backup under a compatible service/credential configuration.

This is recoverable evidence, not automatic transaction rollback. Startup detection/presentation of incomplete recovery records, cross-account credential recovery, forced-crash/full-database recovery drills and power-loss durability qualification remain open. Recovery ZIPs are sensitive local data. The current UI does not present the JSON recovery record automatically.

## Regression tests and actual execution

- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: **71 passed, zero failed, two ignored**. Includes new archive count/aggregate/manifest/path/duplicate checks, bounded streaming, operation-lock/service exclusion, junction-cycle rejection, child timeout/overflow/cancellation and per-file failure preservation. Existing diagnostic redaction tests also execute.
- `scripts/test-database-workspace.ps1`: passed `native_workspace_round_trip` in a new disposable MySQL profile. Tests include grants, import/export, failed/partially applied imports and cancellation. This existing test is not a full-app recovery drill.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **passed** after final changes.
- `git diff --check`: passed. Diff reviewed; changes are confined to the eight backend files listed above and audit/remediation documents. No frontend changes.
- Evidence logs: `review-artifacts/remediation-tests.log`, `remediation-database.log`, `remediation-clippy.log`.

Not executed: live user-database restores, installed UI/exit audit, OS shutdown or hard-kill during each restore phase, recovery on another Windows account. No claim of complete F01/F02 operational qualification is made.

## F07 exposure triage

Used the prior scanner JSON plus `npm explain vite`, `npm explain undici`, and `npm explain glob` against the installed dependency tree.

- Vite 6.4.3 is a development dependency used by the local development server/build and Vitest. The scanner's editor-launch findings are particularly relevant on Windows developer machines. `vite.config.ts` does not explicitly expose the server to the LAN, but loopback access is not a complete security defense. A compatible patched Vite migration needs separate testing; do not dismiss this as harmless because it is development-only.
- undici 7.29.1 is pulled by jsdom 29.1.1 for tests. The shipped Tauri app uses Rust/webview networking, not this Node HTTP client. Test code fetching untrusted URLs can still be affected. Assess a compatible jsdom/undici update with test-environment verification.
- glob/minimatch/sucrase and selector-parser paths are associated with ESLint/TypeScript linting and Tailwind compilation. Tailwind's peer relationship with tailwindcss-animate explains some production-audit classification. These dependency paths do not establish that Node glob traversal ships in the webview bundle. Untrusted patterns/source during builds still warrant patched tooling.
- Node modules are not explicitly included in Tauri bundle resources; the frontend ships compiled dist assets. No exploit was demonstrated, and no blanket assertion of zero runtime exposure is made.

The original scanner reported 13 affected entries (eight high/five moderate); inherited advisory chains are not 13 separate demonstrated exploits. Preserve the lockfile until compatible updates are selected and tested. Rust advisory and bundled runtime matching remain outstanding.

## Release status

**Not production-ready for sign-off.** Source mitigations and regression checks are useful progress, but F01/F02 interruption qualification, F05 race hardening, F07 advisory resolution and F08 release qualification remain open. F04 beta-channel behavior and the other audit findings were not included in this implementation scope.
