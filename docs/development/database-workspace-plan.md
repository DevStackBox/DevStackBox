# Database workspace: UI, UX and implementation plan

Date: 2026-10-25  
Status: **Shipped in v0.1.18 (2026-10-25).**  
Baseline: database workspace implementation and native visual audit completed 2026-10-25.

## Approval refinements

The user approved implementation with additional review feedback. Export opens directly; operation history is shared; previews are risk reviews, not SQL guarantees; integrity and restore verification remain distinct; compatibility metadata is explicit. Batches run sequentially and stop after the first failure. Continue and import retry require fresh review. Deferred migration, remote transfer and account rename remain outside this implementation.

## 1. Objective and scope

Make DevStackBox a dependable place to manage local MySQL databases, accounts, imports, exports and backups while keeping its existing visual identity. Reuse the current MySQL connection, streaming and UI foundations.

The core scope was approved and implemented. The detailed proposal below records the design intent; the visual audit records the delivered scope and remaining limitations. Copy/migration, remote transfer and account rename remain deferred. No release, deployment or version bump was performed. See [the implementation and visual audit](database-workspace-visual-audit.md).

### Recommended core scope

- Databases, Users and Import & Export as the three workspace tabs.
- Discoverable database actions, details and metadata.
- Single and bulk SQL/GZIP export and import with shared dialogs.
- Versioned DevStackBox ZIP packages for selected databases.
- Backup records, restoration, operation history and useful failure recovery.
- Database-level user permissions and clearer account controls.
- Consistent stopped, loading, stale, empty and error states.
- Backend protections, isolated integration tests, documentation and HD screenshots.

### Deferred scope

- Copy/migrate a database to a different name, followed by optional explicit source deletion.
- Remote connection profiles and server-to-server transfer.
- Account username/host migration with dependency inspection.
- Scheduled backups, automatic retention and point-in-time recovery.
- SQL editing, row editing and a complete table designer; keep phpMyAdmin available for these tasks.

Deferred features must not appear as nonfunctional buttons or empty tabs in the delivered UI.

## 2. What exists and what changes

The baseline below comes from source inspection, not a fresh live database test.

| Area | Existing foundation | Planned change |
| --- | --- | --- |
| Database list | Search, counts, size, creation, individual backup | Selection, summary, visible action menu, details |
| Database deletion | Right-click action and confirmation | Visible access, typed-name confirmation, backend system-schema protection |
| Users | List, create, password change and delete | Search, explicit labels, protected identities, database grants |
| Backups | Individual and all-database SQL dumps | Completeness policy, reliable file finalization, records, compression and bulk selection |
| Import | SQL file streamed through MySQL client; initial-database and follow-dump modes | Batch queue, GZIP/packages, accurate preview, progress and recovery |
| Service state | MySQL-required gate | Stale cached information, last refresh, startup/log guidance |
| Connection | Pinned local connection and data-directory verification | Preserve guards for every new data operation |
| Credentials | Protected stored root credential on Windows | Remove password-bearing statements from process arguments; sanitize diagnostics |

## 3. Information architecture and terminology

```text
Databases workspace
  Databases
    Database details
      Overview
      Tables & Views
      Access
      Backups
  Users
    Create user / Change password / Database permissions
  Import & Export
    Export
    Import
    Saved backups
    Activity
```

Use the existing sidebar, typography, blue accent, cards, dialogs and spacing. The inner sections above can be compact tabs or segmented navigation; avoid another large sidebar. Do not introduce a Settings tab without meaningful settings.

| Term | Meaning in the product |
| --- | --- |
| Export | Produce portable database files with selected content and destination |
| Import | Execute a database file, potentially creating or changing objects and data |
| Backup | Save a recovery-oriented database dump with recorded contents and metadata |
| Restore | Apply a saved backup; this is not automatically an exact rollback |
| Copy / migrate | Create and verify a destination while preserving the source |
| Transfer | Future movement between explicitly configured connections |

Do not label logical dumps as point-in-time recovery. A restore that merges SQL does not necessarily remove objects absent from the dump. Make replacement versus merge behavior explicit; no automatic database deletion.

### Navigation compatibility

- Keep `/databases` and `/databases/users`.
- Proposed new workspace URL: `/databases/import-export`.
- Redirect existing `/databases/backups` links to the relevant saved-backup section.
- Proposed details URL: `/databases/database/:name`, with correct URL encoding and decoding.
- Update route helpers, breadcrumbs, command palette, in-app links and documentation coverage together.
- Ensure reserved route words and database names cannot collide.

## 4. Databases screen

### Wireframe

All wireframe values below are illustrative, not live database measurements.

```text
Databases                                      [MySQL running]
Manage local databases, users, imports and exports.

[Databases]  [Users]  [Import & Export]

Databases: 3       Tables: 42       Estimated data + indexes: 120 MB
Last refreshed: 14:32                         [Refresh]

[Search databases........................]   [+ Create database]

[ ] Name             Tables  Views  Estimated size    Actions
[ ] example_app          24      2           80 MB    [Manage] [⋯]
[ ] example_test         18      0           40 MB    [Manage] [⋯]
[ ] empty_project         0      0            0 B     [Manage] [⋯]

2 selected                    [Export selected] [Back up selected]
```

### Interaction rules

- Database name and Manage open the same details screen.
- Visible three-dot menu supports Export, Backup now, Import into this database, Open in phpMyAdmin, Copy name and Delete database.
- A quick Backup button may remain where width permits; avoid repeating every action on each row.
- Right-click may mirror the menu, but must not be the only way to discover actions.
- No bulk database deletion in core scope.
- Select-all applies to the visible filtered results; show the selected count and provide Clear selection. Hidden selections must remain explicitly accounted for.
- Totals describe all listed user databases, with a separate filtered-results count.
- Distinguish base tables from views. Size is an estimate of data plus indexes, not total server disk usage. Never scan all rows just to populate the list.
- Empty database list: explain the next step and offer Create database and Import.
- No search results: preserve the search field and offer Clear search.

### Create database

Fields: name; optional advanced character set and collation. Load supported choices and server defaults rather than hardcoding a collation. Changing character set filters valid collations.

Validate consistently in frontend and backend. Explain allowed names, handle duplicates and case behavior, and distinguish creation rules from the ability to inspect existing names created externally. Preserve entered values on failure. On success, refresh authoritative metadata and offer Open database.

### Delete database

Show the exact name, estimated size, object counts and consequence. Require typing the exact database name and explicit Delete database submission. Offer Backup first, but completion of that backup must not submit deletion automatically.

Reject system schemas in the backend, even if they are absent from the list. If metadata cannot be loaded, show unavailable values rather than zero. Disable conflicting operations and refresh after the result.

## 5. Database details

```text
Databases > example_app
example_app                    [Export] [Import] [Backup now] [⋯]
Local MySQL · selected connection and database

[Overview] [Tables & Views] [Access] [Backups]

Overview
Tables / Views / Estimated data + index size
Character set / Collation / Last refreshed
Recent operations
```

- **Overview:** real metadata, recent relevant activity and connection guidance. Never display or copy administrative credentials as application credentials.
- **Tables & Views:** searchable read-only list; object type, engine where applicable, estimated rows and size where available. Label approximate row counts. Open phpMyAdmin for editing or querying.
- **Access:** database-related account grants and link to the shared permission editor. Clearly distinguish directly managed grants from global, role or other access the editor cannot safely modify.
- **Backups:** records for this database, create backup, restore, inspect contents, open folder and delete backup file.
- Keep destructive actions in the overflow menu and a clearly separated confirmation flow.
- If a database disappears externally, show Database no longer exists with Refresh and Back to databases.
- Character set/collation changes to an existing database are not part of the initial editor; do not imply changing defaults converts existing tables.

## 6. Import & Export workspace

```text
Import & Export
Export databases, import SQL files and manage recovery backups.

[Export] [Import] [Saved backups] [Activity]

Export
Databases: [Select one or more...................]
Content:   [Structure and data v]
Format:    [SQL v]     Packaging: [Separate files v]
Destination: [Chosen folder................] [Browse]

Advanced options
Summary of selected databases and included objects
                                                [Export]
```

Show usable forms directly. No four-card Explore landing page. Per-database entry points preselect the database in these same forms. Batch workflows are part of the core design, not a separate future implementation.

### Export options and behavior

| Option | Proposed behavior |
| --- | --- |
| Selection | One, several, or all user databases; clearly distinguish full-server backup |
| Content | Structure and data, structure only, data only; explain import prerequisites |
| Format | `.sql` or `.sql.gz` |
| Packaging | Separate files or a DevStackBox ZIP package |
| Destination | Native folder/file picker; remember a usable previous location |
| Objects | Explicit policy for tables, views, triggers, routines and events |
| Compatibility | Record source MySQL version; do not promise arbitrary MySQL/MariaDB compatibility |
| Completion | Per-item result, output size/path, Open folder and failed-item retry |

Default to one file per database for bulk exports. A multi-database dump remains appropriate for the clearly labeled full-server workflow. Prevent accidental overwrites; default to unique filenames.

Define consistency strategy: use a suitable consistent snapshot for transactional tables, report nontransactional limitations, and handle concurrent schema changes. Do not promise a globally consistent snapshot across separately exported databases. Avoid an unexplained global write lock.

Backup defaults should include supported schema objects necessary for recovery. Procedures and events require explicit dump options in MySQL 8.4. Object selection and consistency options must be tested together.

## 7. Import and restore workflow

### Step 1: Select files

Use a native multi-file picker for `.sql`, `.sql.gz` and supported DevStackBox ZIP packages. Drag-and-drop is optional if it can reuse identical validation. Display format, size and validation status. Reject unsupported or corrupt input with a specific error.

### Step 2: Review targets and effects

```text
Source                   Target               Mode                 Status
example_app.sql.gz       example_app          Original names       Exists
new_project.sql          new_project          Initial database     New

Existing targets may be modified. SQL can contain destructive statements.
[ ] I reviewed the targets and existing-database warnings.

[Back up existing targets first]                    [Review import]
```

- Show original database names when reliably available, file sizes, target existence and intended creation.
- Distinguish manifest-derived facts, detected hints and unknown information.
- A header sniff is not a complete SQL analysis; do not claim to enumerate every statement or affected schema.
- An initial database is not a security boundary: `USE`, qualified names and other SQL statements can affect other databases.
- Retain original-name restore. Only offer destination remapping for a supported, validated format; arbitrary dumps must not be retargeted by search-and-replace.
- Reject duplicate or overlapping batch targets by default; intentional ordered merges require a separate explicit review.
- Warn before modifying an existing database. No automatic drop, reset or truncation of the target.
- Full-server restore gets a separate review explaining effects on server schemas, accounts and credentials. Do not present it as an ordinary application-database import.
- Read source files as immutable inputs; never rewrite the user's dump in place.

### Step 3: Execute

Default to sequential jobs. Display queued/running/completed/failed/cancelled states, stage, elapsed time and bytes processed where measurable. Reading all bytes is not the same as committing all SQL. Only show success after the client exits successfully and required checks finish.

Default batch policy: stop after the first failure; retain completed results and offer an explicit way to continue eligible remaining jobs. Cancellation stops future jobs and terminates the active client where supported, but cannot promise rollback of prior SQL.

### Step 4: Results and recovery

Show per-file outcomes and affected-target information to the extent known. Warn that changes may already exist after failure or cancellation. Refresh metadata even after partial changes. Do not automatically retry SQL imports, since repeating them can duplicate data or fail differently.

Offer diagnostic details, the backup location when one was created, and relevant restore guidance. A backup file must not be automatically replayed as rollback without a separately reviewed operation.

## 8. Saved backups and packages

### Backup list

Columns: source database or full-server scope, creation time, format, file size, status and actions. Filters: database, date and status. Records must distinguish file present, file missing, checksum mismatch and interrupted creation.

Actions: Backup now, Restore, View contents/metadata, Open folder, Delete backup file, Remove missing record. Deleting a backup file must explicitly say it does not delete the database.

Retain the existing full-server backup capability, but define what objects/accounts it actually includes and prove restore behavior before describing it as complete disaster recovery. Database backups remain distinct from Settings > Backup & Restore, which also covers application files/configuration.

### Package contract

- Versioned manifest with source engine/version, timestamp, database names, character sets/collations, content modes, included object types, file paths, sizes, checksums and per-item results.
- Only supported relative paths; reject absolute paths, traversal, links, duplicate/case-colliding names and unsupported entries.
- Bound entry count, expanded bytes, expansion ratio and temporary disk use. Validate before executing SQL.
- Use an application-owned temporary directory; never unpack into configuration, runtime binaries or database data directories.
- Unknown manifest versions fail with an actionable compatibility message.
- Partial exports must be identified as partial packages; never advertise a complete backup when any requested database failed.
- Checksums detect corruption; they do not establish that SQL is trusted or safe.
- Only claim restoration was verified after an actual restore test. A checksum check alone is file-integrity verification.
- Add no automatic retention/deletion policy in core scope.

## 9. Users and database permissions

```text
Users                                        [+ Create user]
[Search username or host.................................]

Account                     Database access       Actions
example_user@localhost      example_app           [Permissions] [⋯]

Menu: Change password / Delete user
```

### Account forms

- Always identify accounts by both username and host.
- Default host to localhost; explain wider host patterns before accepting them.
- Password entry supports show/hide, confirmation and optional local generation.
- Label the action Change password; never imply the old password can be retrieved.
- Do not infer account safety solely from whether `authentication_string` is empty. Display authentication information only when interpreted correctly.
- Explicitly protect MySQL system identities and the DevStackBox administrative account from ordinary deletion.
- Keep privileged root-password changes integrated with existing credential storage. Report separately if the server password changed but saving the application credential failed.
- Account rename/host changes are deferred until dependent definers and grants can be handled safely.

### Permission editor

Choose one or more databases, then a preset or exact privileges. Proposed presets:

| Preset | Exact initial scope |
| --- | --- |
| Read only | SELECT on the selected database |
| Read/write | SELECT, INSERT, UPDATE, DELETE on the selected database |
| Custom | Explicit supported database privileges, with plain-language descriptions |

Explain that schema migrations may require CREATE, ALTER, INDEX, DROP or other privileges beyond Read/write. Do not silently grant these or GRANT OPTION.

Before saving, show additions and removals for the exact account. Preserve unsupported existing grants, roles and global/table/routine permissions. Display effective-access limitations honestly rather than presenting direct grants as the complete picture. Core scope edits database-level grants only; advanced administration remains available in phpMyAdmin.

Creating an account and assigning grants can partially succeed. If grant assignment fails, report that the account exists and offer to retry permissions; do not falsely report complete failure or silently delete the account.

## 10. Service and operation states

| State | UX behavior |
| --- | --- |
| Initial loading | Skeletons/neutral indicators; no fabricated zero values |
| Running | Live actions available; show last refresh |
| Stopped with cache | Stopped banner, stale labels, Start MySQL and View logs; disable live operations |
| Stopped without cache | Explain prerequisite and provide Start MySQL |
| Starting/stopping | Show transition; prevent duplicate submissions |
| Authentication failure | Preserve cached data, explain connection problem and link to credential guidance |
| Wrong instance | Refuse operation; show the existing instance-verification error |
| Refresh failure | Keep old values labeled stale; Retry and diagnostic details |
| Operation running | Shared progress survives navigation; prevent conflicting changes |
| Interrupted by app exit/crash | On reopening mark unfinished jobs interrupted/unknown, never successful |

Persist only bounded, nonsecret history and safe job metadata. Never automatically resume an interrupted import. Scope cached data by connection/data-directory identity, and invalidate or mark it stale when that identity changes.

Coordinate application-initiated service stops with active jobs. If MySQL stops externally, record a failure/unknown outcome and refresh after recovery. Warn before closing the application during an active mutation; do not promise work will continue in the background unless implemented and tested.

## 11. Shared UI/UX quality rules

- Reuse existing shadcn/Radix components and established design tokens.
- Support light/dark modes, keyboard navigation, visible focus and sensible tab order.
- Label icon buttons and associate validation messages with fields.
- Dialogs keep entered values on recoverable errors, focus the relevant error and return focus to the trigger on close.
- Use inline validation for field errors, a result panel for long operations and toasts for brief feedback. Do not rely on toasts as the only operation record.
- Announce important state changes accessibly without announcing every progress tick.
- Support narrower desktop windows and Windows display scaling; wrap toolbars and use deliberate table scrolling rather than hiding critical actions.
- Respect reduced motion. Use text as well as color for status.
- Add English and Hindi strings for every new label, error and confirmation, including pluralization.
- No simulated progress percentages, placeholder metadata, empty feature tabs or Coming soon controls in release screens.
- UI wording should describe local development operations; do not imply DevStackBox is a managed production database service.

## 12. Backend and data design

### Shared services

Build a shared database-operation layer used by list actions, details, Import & Export and backup flows. Avoid separate implementations of export versus backup or import versus restore.

Conceptual models:

- Database summary: identity, table/view counts, estimated sizes, charset/collation and refresh time.
- Operation: ID, kind, connection identity, stages, timestamps, item results and sanitized errors.
- Operation item: database/file identity, target, state, measurable progress and output metadata.
- Backup record: scope, file location, source version, contents, checksum and verification level.
- Package manifest: versioned portable metadata; never credentials.

### Reliability requirements

- Validate all arguments in Rust; frontend checks provide usability, not authorization.
- Preserve pinned local connection and data-directory checks for new commands.
- Centralize identifier/account handling; do not concatenate unvalidated SQL or assume SQL escaping works under every SQL mode.
- Keep sensitive SQL out of process arguments; avoid secrets in errors, logs, manifests or history. Review the existing environment-based credential transport as part of credential handling.
- Run blocking process/file work off async runtime workers using the established blocking-task pattern.
- Use coordinated operation locks; bulk jobs must not deadlock when calling shared helpers. Serialize conflicting imports, deletion, maintenance and backup-sensitive work.
- Use unique temporary files on the destination volume, check write/flush/process results, then finalize output. Never overwrite a good backup with an incomplete one.
- Kill/wait for child processes and drain pipes on every failure/cancel path. Bound diagnostics and clean temporary files.
- Define disk-space and decompression limits with clear messages. Retain streaming for large inputs; do not load full dumps into memory.
- Refresh affected caches after completion and partial failure. Prevent stale in-flight responses from replacing newer metadata.
- Keep backup files outside automatic cleanup paths and preserve existing backup locations/records during upgrade.

### Concrete baseline gaps to resolve

Source inspection found missing explicit routine/event dump flags, direct writes to final backup filenames, ignored flush errors, second-resolution filenames that can collide, password-bearing SQL passed with `-e`, and no explicit system-schema rejection in the drop command. Existing import locking and cached-data behavior need coordination with the expanded operation model.

These findings are implementation targets, not claims that each failure was reproduced against the user's databases.

## 13. Deferred copy/migration and remote transfer

### Copy to another database

Implement only after export/import verification is dependable. Require a new destination name and inspect tables, views, triggers, routines, events, foreign keys, definers, grants and qualified schema references. Define supported cases and reject unsupported cases clearly.

Pause application writes where necessary to obtain a consistent copy. Preserve the source, verify supported objects/data, report limitations and offer source deletion as a separate explicit action. Explain required application connection changes; never silently rewrite project `.env` files.

Do not use global string replacement on SQL, promise an atomic rename, or equate matching row counts with full semantic equivalence.

### Remote transfer

Requires an independent connection-profile design: host/port, identity, protected credentials, TLS certificate validation, connection testing, engine/version compatibility and explicit source/destination review. SSH tunneling is outside core scope.

Do not weaken current local-instance guards to add remote support. Define a separate authorized connection boundary. Default transfer to copy, with no source deletion. Stage and test compatibility before executing on a remote target.

## 14. Implementation map

| Existing area | Expected work after approval |
| --- | --- |
| `src/pages/databases-list.tsx` | List, selection, visible menu and shared entry points |
| `src/pages/databases/layout.tsx` | Tab naming/navigation |
| `src/pages/databases/backups.tsx` | Evolve into Import & Export; preserve legacy navigation |
| `src/pages/mysql-users.tsx` | Account UX and permission editor integration |
| `src/components/restore-sql-dialog.tsx` | Shared import/restore review and result flow |
| `src/components/mysql-required.tsx` | Service-state presentation without losing useful cached context |
| `src/context/database-cache-context.tsx` | Identity, freshness, race prevention and invalidation |
| `src/lib/routes.ts` and command definitions | Details/import-export routes and typed command contracts |
| `src-tauri/src/commands/mysql.rs` | Shared export, backup, account and schema protections |
| `src-tauri/src/commands/mysql_import.rs` | Batch/format integration and task coordination |
| `src-tauri/src/utils/mysql_connection.rs` | Preserve verified connection handling |
| SQL/credential utilities | Consistent validation and sensitive-input handling |

New components/modules should follow existing project conventions. Final filenames and command schemas can be chosen during implementation; the user-visible requirements above are the review contract.

## 15. Phases and completion gates

| Phase | Deliverable | Required gate |
| --- | --- | --- |
| 0 | Confirm this plan and core/deferred scope | User approval before application edits |
| 1 | Reliability foundations and task state | Failure cleanup, secret handling, protected objects and real dump/restore tests |
| 2 | List/details/create/delete and service-state UX | Keyboard/scaling checks, accurate metadata, isolated destructive-action tests |
| 3 | Single and bulk SQL/GZIP import/export | Target review, per-item outcomes, partial failure and cancellation tests |
| 4 | Saved backups and ZIP packages | Manifest validation, corrupted/missing files, extraction limits and restore tests |
| 5 | Users and database grants | Exact-account tests, supported grant diffs, preserved unsupported privileges |
| 6 | Documentation, screenshots and release-readiness audit | Native evidence, docs/website build checks, no unsupported feature claims |
| Later | Copy/migration and remote transfer | Separate detailed design and approval |

Tests and documentation are updated in every phase; phase 6 consolidates them rather than postponing quality checks until the end. No next version number is assumed. Building/publishing a release remains a separate user decision.

## 16. Validation and acceptance criteria

Use disposable databases and an isolated MySQL profile/data directory and port. Do not test destructive paths on the user's projects or backups.

| Area | Required scenarios |
| --- | --- |
| Metadata | Empty databases, views, many databases, stale cache, disappearing database, size labels |
| Validation | Duplicate names, supported naming edge cases, case handling, invalid paths, direct command calls |
| Protection | System schemas/accounts rejected, exact user+host targeting, wrong-instance refusal |
| Export | Tables/data/views/triggers/routines/events round trip, unique filenames, permission/disk-full errors |
| Consistency | Transactional/nontransactional limitations, concurrent writes and schema changes |
| Import | Malformed SQL, unknown charset/collation, CREATE DATABASE/USE, partial application and no false rollback |
| Batch | Duplicate targets, failure stops queue, cancelled pending items, deliberate retry/continue behavior |
| Compression | Corrupt/truncated GZIP, ZIP traversal/links/collisions, unsupported manifest, expansion limits |
| Process lifecycle | Client exit failure, app navigation, app close, external MySQL stop, orphan/temporary-file cleanup |
| Permissions | Exact grants/revokes, preserved unmanaged privileges, partial account creation, root credential-save failure |
| Secrets | No passwords in process arguments, diagnostic output, activity records or package metadata |
| UX | Keyboard/focus, light/dark themes, Hindi/English, small windows, scaling, empty/loading/error states |

Run relevant frontend tests, TypeScript checks, Rust tests and native integration tests, plus documentation validation and the website build when those files change. Browser mock data cannot establish native database correctness.

Completion means all shipped controls work, documented behavior matches the native build, failed/partial operations are truthful, existing backup/restore workflows remain reachable and deferred features are absent from release UI.

## 17. Documentation, website and HD screenshots

Update these existing guides as features become real:

- `docs/user-guide/databases.mdx`: list/details, creation/deletion, accounts and grants.
- `docs/user-guide/database-backups.mdx`: Import & Export, formats, batch operations, target semantics and recovery.
- `docs/user-guide/full-backup.mdx`: distinction between database dumps and application backup.
- `docs/advanced/troubleshooting.mdx`: authentication, stopped service, disk/file errors and partial imports.
- Command reference, architecture, documentation coverage and navigation metadata.
- `DEVSTACKBOX.md` and website-generated AI guidance where database usage instructions change.
- Website feature text and links only when the corresponding behavior is available; preserve historical v0.1.17 accuracy.

Screenshot set: database list with selections, details, users/permissions, export review, import target mapping, batch results, saved backups and MySQL-stopped stale state.

Capture the actual native app at approximately 1920-pixel desktop width or better, with readable UI scaling and nonpersonal demonstration data. Keep original-resolution PNGs, create appropriately sized web variants without upscaling, provide click-to-zoom and descriptive alt text, and check desktop/mobile rendering. Never substitute AI-generated UI or low-resolution enlarged images for feature evidence. Screenshots supplement complete written instructions.

## 18. Review checklist

- [x] Approve Databases | Users | Import & Export navigation.
- [x] Approve the list/details layouts and visible per-database menus.
- [x] Approve single and bulk operations in core scope.
- [x] Approve SQL/GZIP and versioned DevStackBox ZIP packages.
- [x] Approve backup records and shared activity/progress model.
- [x] Approve database-level permission editing with conservative presets.
- [x] Approve typed-name deletion and explicit import-target reviews.
- [x] Confirm copy/migration, remote transfer and account rename remain deferred.
- [x] Approve tests, documentation and native HD screenshot requirements.
- [x] Explicitly authorize implementation after reviewing any requested revisions.

## 19. Technical references

- [MySQL 8.4 mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html): object inclusion options, dump modes and database-selection statements.
- [MySQL 8.4 RENAME TABLE](https://dev.mysql.com/doc/refman/8.4/en/rename-table.html): cross-schema restrictions relevant to a future migration feature.

These references support the design constraints. They do not replace testing against the MySQL runtime shipped with DevStackBox.
