# SQL ZIP import fix and verification — 2026-10-27

## Cause and change

The importer required a DevStackBox manifest for every ZIP file. The reported backup was an ordinary ZIP containing one SQL dump, so validation rejected it before MySQL ran. The UI also disabled the initial target field for every ZIP and could retain an earlier inspection error.

Ordinary ZIP archives now support exactly one SQL entry at the archive root. They use the same review and initial-target flow as SQL files. DevStackBox packages retain manifest, checksum and original-name restore behavior. Archive path, entry count, size and expansion limits remain enforced. A malformed manifest does not fall back to ordinary SQL import. Multiple SQL files or nested entries require extraction and separate review.

The review UI clears old errors, ignores superseded inspection responses, and clears inherited targets only for verified DevStackBox packages.

## Verification

- Frontend: 73 tests across 13 files passed; TypeScript checking passed.
- Rust: 62 unit tests passed, two native integration tests excluded from the ordinary run.
- Both native integration tests then passed against disposable MySQL 8.4.11 instances: existing SQL/GZIP/package round trips and the actual reported ZIP.
- Actual backup: 24,583,213 compressed bytes, one 222,085,150-byte SQL entry; native import produced 246 base tables.
- Desktop UI: selected the original ZIP through the file picker, reviewed it, entered a fresh target, acknowledged the import review and started the job. Activity displayed **Import · Completed**. An independent query confirmed **246 base tables** in `zip_ui_audit`.
- UI test ran the current Tauri development build using an isolated data profile and MySQL port, not the user's normal databases. It is not a verification of a newly installed release binary.
- Local screenshot evidence: `review-artifacts/zip-import-ui-completed.png` (ignored development artifact, not public website content).

Changes are recorded under Unreleased. No release was published or installed as part of this fix. The original ZIP is unchanged.
