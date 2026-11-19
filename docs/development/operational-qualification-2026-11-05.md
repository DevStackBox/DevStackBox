# Operational qualification - 5 November 2026

Status: **not release-qualified**. This pass adds qualification harnesses and documentation only; database UI, migration implementation, dependency versions and signing configuration are unchanged.

## Environment and evidence identity

Windows x64 host, build 26300 (Get-ComputerInfo reports Windows 10 Pro/2009; those legacy product labels are not a reliable marketing-version identifier). Node 24.22.1, Rust 1.93.0, Python 3.14.3, MySQL 8.4.11; D: is NTFS. Source baseline HEAD `63b17fd58e3cf475346192a0fa6c90df397f0fa3` plus the uncommitted backup remediation diff. A same-host disposable environment is used, not a VM or clean OS. SHA-256 identities for the harness, runners, manifest, lockfile and reviewed source patch are retained in `review-artifacts/qualification-artifact-hashes.json`.

`DEVSTACKBOX_DATA_DIR` alone does **not** isolate www: `user_www_dir()` uses the installation directory. Consequently the qualification executable is built in release mode and copied into a newly marked disposable installation with its own www and MySQL binaries, a new data directory, loopback-only random MySQL port and isolated configuration. Existing installations/databases are not targets. Tests deliberately mutate only synthetic `qual.sentinel` and disposable files. MySQL is shut down in the runner's finally block; evidence is retained.

Harness: `src-tauri/examples/backup_qualification.rs`; runners: `scripts/qualify-backup.py`, `scripts/qualify-backup-mid-import.py`. The harness invokes the actual fullbackup commands using a Tauri AppHandle; it is not the complete installed GUI startup path. This distinction matters for restart/quit qualification.

Commands:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --release --example backup_qualification
& 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/mt.exe' -manifest scripts/backup-qualification.manifest '-outputresource:src-tauri/target/release/examples/backup_qualification.exe;#1'
python scripts/qualify-backup.py
# Then pass the reported disposable environment path:
python scripts/qualify-backup-mid-import.py <reported-disposable-path>
```

The first executable failed at Windows loading with status 0xC0000139, before command execution. Adding the Common Controls v6 manifest to the test executable resolved it. This was a harness issue, not a backup pass. Reapply the manifest after rebuilding the harness.

## F01/F02 operational scope

Phase-boundary matrix: backup preparing/config/www/mysql and restore preparing/recovery/restoring_config/restoring_mysql/restoring_www. Each boundary requests cancellation, aborts the process, or attempts Apache/MySQL stop and asserts the active-operation guard. A new harness process is launched after each case and database/file sentinel values are compared. Abort is abrupt process termination, not a simulated power failure. The additional mid-import test externally kills the parent after observing committed SQL, waits beyond the dump's sleep, then checks whether the child continued.

The baseline drill creates a full backup, changes both a file and a database value, restores the baseline, then restores the automatically recorded recovery ZIP and verifies the pre-restore file/database values. This verifies actual recovery on the same compatible MySQL/Windows account; it does not certify cross-version or cross-account recovery.

Malformed archive fixtures are sent to the real restore command: 65,537-byte manifest, 100,002 total entries, case-fold duplicate paths, parent traversal, NTFS alternate data stream, Unix symlink entry, corrupted stored-entry CRC, and SQL/manifest mismatch. For each rejection, compare database value, web-file bytes and my.cnf bytes. Aggregate-budget coverage uses the validator's parameterized small-budget unit fixture; no 32 GiB expansion was generated. This needs to be stated separately from production-size stress testing.

Evidence: `review-artifacts/qualification-run.log`, the run's `results.json`, per-command logs and `mid-import-results.json`. Machine-checkable results are authoritative; process exit alone is insufficient because Tauri's no-window test runtime can return zero while the command result is Err.

Remaining scope: complete installed GUI close/updater/OS-shutdown pathways, live Apache with requests in flight, kills during every internal copy/write/rename point, disk-full/power-loss recovery, actual GUI startup after interrupted restore, and the 32 GiB production-limit stress run. Harness restart does not execute normal app startup and is not proof that all application startup paths avoid replay. Source search found restore registered as a command, not automatically invoked from lib.rs/App.tsx/main.tsx.

### Executed results and new findings

The initial completed matrix is retained at `review-artifacts/backup-qualification-1793863987/results.json`: 65 command invocations, including 27 phase/action combinations, 27 follow-up harness launches, eight malformed restores and three baseline/recovery operations. All 27 requested boundaries were reached. All nine service-stop cases rejected both stop commands while the operation was registered. Nine aborts terminated the parent at the requested boundary. Eight cancellation requests returned cancellation; the final `restoring_www` request returned success because that progress event follows publication of the only web file. Treat this as a completion-boundary behavior to specify and test, not nine successful cancellations.

Mid-statement execution used this synthetic SQL against a disposable database:

```sql
UPDATE qual.sentinel SET value='partial';
SELECT SLEEP(12);
UPDATE qual.sentinel SET value='late';
```

Exact invocation: `python scripts/qualify-backup-mid-import.py review-artifacts/backup-qualification-1793863987`. Evidence: `review-artifacts/qualification-mid-import.log` and that environment's `mid-import-results.json`.

| Test                                    | After parent exits | After waiting 13 seconds | After harness restart | Recorded ZIP restores original DB and file |
| --------------------------------------- | ------------------ | ------------------------ | --------------------- | ------------------------------------------ |
| Graceful cancellation during SQL        | partial            | partial                  | partial               | Yes                                        |
| External parent process kill during SQL | partial            | **late**                 | late                  | Yes                                        |

**OQ-01 - High, open: orphaned import continues after forced app termination.** The second UPDATE executes after the parent dies. The existing in-process lock and cancellation cleanup cannot protect against this. A newly started application could see no active job while the surviving import still changes data. This is continuation of an existing child, not evidence that startup replays the import. Do not start another restore until the old client is confirmed terminated and the server operation has settled. The drill waited for the synthetic operation to end before explicitly restoring its recorded ZIP.

Proposed correction, not implemented in this qualification pass: extend the existing process helper to launch database clients in a Windows Job Object with kill-on-last-handle-close, retaining a non-inheritable owning handle for the operation. Eliminate the spawn/assignment window (suspended creation plus assignment before resume, or a verified equivalent), fail closed on assignment failure, and test nested-job compatibility. Keep MYSQL_DATA_LOCK as the sole operation lock; process containment is not a replacement lock. Killing the client does not undo committed SQL or guarantee instantaneous cancellation of a server-side statement, so recovery still requires settling/verification. Test forced kills before spawn, after assignment, during streamed SQL and after child completion, plus server-side long queries and restart overlap. [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

**OQ-02 - Open qualification gap: restart/no-replay proof is incomplete.** Harness restart deliberately invokes no restore command; unchanged sentinels therefore establish only that these harness launches did not replay data. They do not qualify normal GUI startup, updater restart or Windows reboot. Incomplete records exist and actual recovery succeeds, but automatic discovery/presentation of those records and a full installed startup drill remain required.

**OQ-03 - Completion-boundary cancellation:** the final web-file progress callback can arrive after all work is committed. Specify that cancellation is best effort until completion, then test both accepted-before-publication and too-late-after-publication outcomes. No UI changes were made.

All eight malformed fixtures were rejected before SQL/file application. The strengthened run at `review-artifacts/backup-qualification-1793864505` completed the same 65 invocations and compares SHA-256 maps of every file in disposable config/www plus an all-databases logical dump (`mysqldump --all-databases --skip-comments --skip-dump-date --skip-lock-tables`), retaining `rejection-state-*.json` before/after evidence: **eight identical before/after snapshots**. This is stronger than the initial three-sentinel assertions. Metadata/ACL equivalence and concurrent hostile filesystem mutation are not asserted by content hashes.

Final harness additionally invokes the real `quit_app` command alongside each service-stop attempt. `python scripts/qualify-backup.py > review-artifacts/qualification-final-run.log 2>&1` completed in `review-artifacts/backup-qualification-1793864703`: **65 invocations, 27 boundaries reached, nine service-stop guards and nine application-Quit guards confirmed, eight unchanged rejection snapshots**. Evidence was checked both by runner assertions and a separate count/log review. This tests the native Quit guard, not every Windows close/shutdown delivery path. The disposable MySQL server processes exited; the existing `C:\devstackbox` MySQL installation was left running and untouched.

### Automated checks executed in this pass

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib archive_tests -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
python -c "import ast,pathlib; [ast.parse(pathlib.Path(p).read_text()) for p in ['scripts/qualify-backup.py','scripts/qualify-backup-mid-import.py']]"
```

Archive tests: **2 passed**. Full native suite: **71 passed, 0 failed, 2 ignored** (the existing `native_external_zip_import` and `native_workspace_round_trip` tests require their separate integration runner; neither is counted as passed here). Clippy, Python syntax and diff whitespace checks passed. Logs: `review-artifacts/qualification-archive-tests.log`, `qualification-lib-tests.log`, `qualification-clippy.log`. These repeat source regressions; operational outcomes above include a reproduced failure and must not be represented as an all-green qualification.

## F05: proposed handle-based migration design - no implementation in this pass

Current check-then-open logic is vulnerable to a source or destination directory being replaced with a junction after metadata validation. Rechecking a string path cannot eliminate that race. The same concern applies to restore destination traversal.

Proposal:

1. Add one small Windows filesystem module with RAII owned handles, component validation and explicit errors. Avoid exporting generic arbitrary NT paths to frontend IPC.
2. Open source/destination roots from a trusted base and retain their handles. Validate reparse tags, directory type, volume and file identity on opened objects. Reject UNC/device namespaces and unsupported filesystem cases until tested.
3. Traverse one component at a time relative to a retained parent handle using the documented user-mode NtCreateFile RootDirectory mechanism. Open the reparse object without following it, inspect its attributes and reject links. Do not assume OPEN_REPARSE_POINT alone protects intermediate string-path components. Prototype exact directory flags against supported Windows versions; do not claim undocumented flag combinations are guaranteed.
4. Keep ancestor handles with sharing that denies delete/rename while operating. Copy source content through the validated file handle, not by reopening its path. Create destination files with create-new semantics and restrictive ownership; do not overwrite user files.
5. Publish using an operation on the already opened file/parent handles after sync. If publication cannot maintain the confinement guarantee, fail closed and retain a diagnostic; do not fall back to ordinary string-path copying.
6. Handle hard links explicitly: create-new destination files prevent overwrite through preexisting hard links; source policy must decide whether linked files are allowed. Audit stream names, reserved DOS device names, case folding, trailing dots/spaces and extended path prefixes.
7. Adversarial test worker repeatedly exchanges a child directory for a junction while migration reads/writes; assert outside sentinel hashes stay identical. Test root and intermediate swaps, deletion, reparse conversion, hard links, UNC refusal, ACL denial, disk-full and normal deep paths. Run NTFS Windows 10/11 supported versions; other filesystems need an explicit support decision.

References: [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew), [user-mode NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile), [reparse point operations](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-point-operations). These APIs inform a prototype; this proposal is not a proof of race freedom.

## F07: compatible candidates and test matrix

Queried npm registry versions/engines and its bulk advisory endpoint; evidence `review-artifacts/candidate-*.json`, `candidate-advisories.json`. No lockfile modification or package upgrade occurred.

| Component               | Candidate | Assessment                                                                                                                                                                                                                                               |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite 6.4.3              | 6.4.5     | Same-major patch; engines accept Node 24 and current Vite React/Vitest peer ranges accept Vite 6. Bulk query returned no matching advisory for this candidate. Verify dev-server editor endpoints, HMR, production build and Tauri dev before accepting. |
| undici 7.29.1 via jsdom | 7.30.1    | Same-major patch within jsdom range; requires Node >=20.18.1, satisfied here. Bulk query clean for candidate. Verify jsdom tests, redirects/TLS error paths and mocks.                                                                                   |
| postcss-selector-parser | 6.1.5     | Same-major patch candidate; queried engine >=4. Bulk query clean. Verify Tailwind output, theme/contrast classes and production CSS.                                                                                                                     |
| minimatch 9.x           | 11.0.1    | 9.0.7 fixes older high advisories but remains affected by GHSA-g3hv-75wg-m249. 11.0.1 crosses major versions; prefer parent ESLint/TypeScript tooling updates over a blind override.                                                                     |
| glob 10.5.0 via sucrase | 14.0.2    | Older <=14.0.1 matches the queried cancellation advisory. Major jump requires parent-package compatibility review; no forced override proposed.                                                                                                          |

[Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [Vite patch release](https://github.com/vitejs/vite/releases/tag/v6.4.5), [undici patch release](https://github.com/nodejs/undici/releases/tag/v7.30.1).

Upgrade test matrix: clean npm ci on Node 24/Windows; npm run check:ci; production npm run build; npm run test:packaging; PHP CLI checks; Tauri dev HMR/editor handling; native updater/PHP download TLS smoke; website docs compilation if shared output changes; compare generated CSS/assets and repeat npm audit. Change one compatible group at a time with lockfile diff review. Engine/peer compatibility is preliminary, not a substitute for actually testing upgraded packages.

## Rust advisory scan

Installed cargo-audit 0.22.2 locally under ignored review-artifacts (no global PATH change):

```powershell
cargo install cargo-audit --locked --root review-artifacts/audit-tools
./review-artifacts/audit-tools/bin/cargo-audit.exe audit --file src-tauri/Cargo.lock --json
cargo tree --manifest-path src-tauri/Cargo.toml -i rustls --target x86_64-pc-windows-msvc
cargo tree --manifest-path src-tauri/Cargo.toml -i quinn-proto --target x86_64-pc-windows-msvc
cargo tree --manifest-path src-tauri/Cargo.toml -i quick-xml@0.39.4 --target x86_64-pc-windows-msvc
cargo tree --manifest-path src-tauri/Cargo.toml -i zip@4.6.1 --target x86_64-pc-windows-msvc
```

Scan completed with findings: **22 package/advisory matches**, plus ten unmaintained, four unsound and one yanked warning entries. Advisory DB revision `965bf9ad083b58e6340d65829d85217b18be9290`, last updated 3 November 2026. Raw evidence: `rust-advisories-2026-11-05.json`; compact exact IDs/versions/fixes: `rust-advisory-summary.json`.

- rustls 0.23.40 is active through reqwest and updater. Scanner recommends >=0.23.46 for the complete matched set. TLS security findings are release blockers pending compatibility review and patching.
- rustls-webpki 0.103.13: candidate >=0.103.16; webpki roots/root-certs 1.0.7: >=1.0.10.
- quinn-proto 0.11.14 appears in lockfile but inverse Windows active-tree query printed nothing; do not count its five matches as confirmed enabled HTTP/3 exposure. Candidate covering matched advisories >=0.11.18.
- quick-xml 0.39.4 appears through plist/tauri-utils, including build paths; candidate >=0.41.0 requires parent resolution review. A second 0.41.0 is already present.
- zip 2.4.2 (app) and 4.6.1 (updater) each match four advisories; scanner points to >=9.0.0, a substantial API migration. App code search found no `.extract(` calls, so extraction-helper advisories are not automatically reachable through the manual full-backup validator. Inspect updater's platform-specific extraction before classifying its exposure.

These are scanner matches, not exploit demonstrations. No suppression or dependency upgrade was applied.

## Bundled runtime matching

Exact versions obtained from bundled executables / phpMyAdmin Version.php, not marketing text:

| Runtime    | Actual bundle                                | Matching result                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apache     | 2.4.65 Win64, Lounge VS17 build 24 July 2025 | Affected by CVE-2026-24072 (through 2.4.66); generated config enables mod_rewrite and managed projects permit .htaccess. Also version/platform match for CVE-2026-59685, Windows path expansion (2.4.0–2.4.68). Refresh and test against 2.4.69 fixes. CVE-2026-23918 affects 2.4.66 specifically and is not assigned to this 2.4.65 bundle. These examples establish exposure; they are not an exhaustive CVE inventory. |
| MySQL      | 8.4.11 Win64                                 | October 2026 CPU includes affected range 8.4.0–8.4.12, e.g. CVE-2026-101800 privilege handling and CVE-2026-101747 InnoDB. Candidate 8.4.13 LTS; test real data upgrade and backup/restore compatibility.                                                                                                                                                                                                                 |
| PHP        | 8.3.36 ZTS VS2019, receipt 8.3.36-1          | Matches upstream October 22 fixes GHSA-w8hw-w9fx-j79w and GHSA-6wmf-4rv5-p3rp. No later 8.3 entry found in consulted changelog. This is not a complete audit of bundled OpenSSL/cURL/other DLLs.                                                                                                                                                                                                                          |
| phpMyAdmin | 5.2.2                                        | PMASA-2025-1, -2 and -3 affect versions before 5.2.2; these consulted advisories are fixed in bundle. Upstream offers 5.2.3; version difference alone is not evidence of an applicable security defect.                                                                                                                                                                                                                   |

Sources: [Apache advisories](https://httpd.apache.org/security/vulnerabilities_24.html), [Oracle October CPU](https://www.oracle.com/security-alerts/cpuoct2026.html), [MySQL October releases](https://blogs.oracle.com/mysql/mysql-october-2026-ga-releases-now-available), [PHP changelog](https://www.php.net/ChangeLog-8.php), [phpMyAdmin security](https://www.phpmyadmin.net/security/). No runtime was upgraded. Complete third-party DLL SBOM/advisory matching and upstream artifact provenance remain open.

## F08 exact-candidate qualification plan

Existing installer on disk: `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.22_x64-setup.exe`, 187,764,623 bytes, SHA256 `D9F54708F067AA7CA73C6C4348E49A09EAB2B2E70544C4C5ACA0E9DFFCFADB3B`. This is **not the remediated candidate**. Existing release EXE SHA256 `442EECEEFF501DFC910FD88311F411E939AA91F8192425B40375337319AF1385`. The remediation source is dirty; version alone cannot identify candidate bytes.

Gate 0: resolve high-risk findings, freeze source commit and lockfiles/runtime receipts, build once through existing release pipeline, record installer/EXE/signature hashes and toolchain, independently verify updater signature. Never substitute an older same-version installer. No release is published by this plan.

Use disposable Windows VM snapshots with fresh user account and NTFS: supported Windows 10/11, standard-user launch plus administrator install, default and spaces/non-ASCII install paths where supported. Disable shared writable host folders and use synthetic projects/data only.

1. **Clean install:** verify checksum, install exact candidate, record UAC/installer logs, check files/ACLs/PATH/new-terminal PHP, Apache/MySQL startup and loopback bindings, PHP temp files, project runtime, HTTPS trust scope, database roundtrip and recovery drill. Confirm data paths and first-run defaults.
2. **Upgrade:** snapshots with previous public v0.1.21 and representative older v0.1.17; seed custom ports/php.ini, root password, pinned PHP, projects outside www, DB data and grants. Record hashes/counts; upgrade while services run and while an operation is active. Confirm safe refusal or orderly completion, data/settings preservation, no duplicate PATH/config entries, original backups recoverable.
3. **Uninstall:** check documented keep-data choice and explicitly selected removal in separate snapshots. Verify external projects/databases, unrelated PHP/PATH entries and other server installations are untouched. Reinstall retained profile and verify operation.
4. **Interrupted upgrade:** power off VM during preflight, service stop, www preservation, payload copy, configuration migration and finalization. On snapshot restart, record executable/config/data state and attempt the documented recovery/reinstall procedure. Success requires a usable old or new installation, preserved data and actionable failure; never infer atomic rollback from installer exit code.
5. **Artifact identity:** run final tests on exactly the hashed installer, retain VM logs/screenshots and results keyed to hash. A rebuild invalidates qualification. Do not publish or change signing credentials in this pass.

No clean-install/upgrade/uninstall VM run was executed here; task requested the plan. Existing NSIS regression tests are useful supplemental evidence, not substitutes for this matrix.

## Changed files and disposition

| File added in this pass                                    | Purpose                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/examples/backup_qualification.rs`               | Native command harness using existing locks and actual backup/restore/cancel/service/quit functions; bounded disposable-profile guard.                   |
| `scripts/backup-qualification.manifest`                    | Windows Common Controls dependency for the test executable.                                                                                              |
| `scripts/qualify-backup.py`                                | Disposable MySQL initialization, roundtrip/recovery, phase-boundary interruption matrix, archive rejection and complete destination-content comparisons. |
| `scripts/qualify-backup-mid-import.py`                     | Mid-statement cancellation/parent-kill reproduction and recorded recovery ZIP drill.                                                                     |
| `docs/development/operational-qualification-2026-11-05.md` | This report, proposals, evidence paths and release gates.                                                                                                |

The eight previously modified backend files belong to the source remediation reviewed at the start of this task. They were inspected but not changed further during this qualification pass. No dependency lockfile, database UI, migration logic, runtime bundle or signing credential changed. No installer was built or published; the release-mode build here is the test example only.

| Finding / task                 | Disposition after this pass                                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 lifecycle                  | Guard behavior verified at tested boundaries; **open** because forced parent termination leaves a live import child and full application lifecycle coverage is incomplete.                                                                                 |
| Recovery ZIP                   | **Verified on compatible disposable Windows/MySQL environment**, including after partial SQL and parent kill. Cross-account/version, extra-object reconciliation and power-loss durability remain unqualified.                                             |
| Automatic replay               | No replay observed in harness; **normal application restart verification remains open**. A surviving child must not be mistaken for replay.                                                                                                                |
| F02 bounded archive validation | Eight malformed fixtures rejected with unchanged destination-content snapshots; scaled aggregate/streaming budget tests passed. **Partially verified**, not a proof against the concurrent filesystem race or all decompression/resource exhaustion cases. |
| F03 / F06                      | Existing deadline and diagnostic regressions included in the 71-pass suite; no new implementation claim this pass.                                                                                                                                         |
| F05 filesystem race            | **Open**; concrete handle-based proposal supplied, implementation and adversarial race qualification not performed.                                                                                                                                        |
| F07 npm / Rust                 | **Open**; compatibility candidates and test matrix documented, real Rust scan completed with findings, no blind upgrades.                                                                                                                                  |
| Bundled runtimes               | **Open**; Apache/MySQL security version matches require runtime updates and regression qualification. Consulted PHP/phpMyAdmin advisories do not establish a complete clean SBOM.                                                                          |
| F08 release qualification      | Plan prepared; **blocked for sign-off** until a remediated exact candidate exists and required Windows VM runs pass.                                                                                                                                       |

Next execution order: contain/reap child processes and qualify restart overlap; repeat interruption/recovery tests including actual application startup/exit; prototype and validate handle-based filesystem confinement; apply reviewed compatible dependency/runtime patches with their test matrix; freeze and hash the release candidate; execute the F08 VM matrix. None of the results above authorizes production-readiness sign-off.

**6 November follow-up:** [MySQL containment and real desktop recovery qualification](./mysql-containment-remediation-2026-11-06.md) implements client containment and repeats the interruption/recovery drill, including real executable startup and window-close behavior. Its status table supersedes the current status of OQ-01/OQ-02 while retaining this report's historical failing evidence. The overall verdict remains partial; F05 and release qualification remain open.
