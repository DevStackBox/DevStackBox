# MySQL process containment and restart qualification - 6 November 2026

Verdict: **PARTIAL; not release-qualified**. This document supplements the [5 November operational report](./operational-qualification-2026-11-05.md). That report's historical failure remains valid for its tested executable; this pass changes the launcher and repeats the interruption drill.

## Reviewed behavior and implementation

The existing `MYSQL_DATA_LOCK` excludes competing operations only inside a live application process. `wait_bounded` previously killed/reaped a child on cancellation, timeout or output overflow, but Windows does not kill a child simply because its parent dies. Full restore, legacy imports, database-workspace jobs, queries and dumps used ordinary process creation. The previous hard-kill drill consequently committed the second UPDATE after DevStackBox terminated.

Process inventory reviewed before implementation:

| Paths                                                                                          | Previous tracking                                                          | Change                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `commands/fullbackup.rs` dump and restore                                                      | Bounded wait, cancellation flag, recovery journal, existing operation lock | Contained client creation; restore also checks server activity before stopping services or creating recovery data |
| `commands/database_workspace.rs::run_process`                                                  | Native registry, cancel flag, stdout/stderr workers, wait/reap             | Same registry/cancellation with contained client                                                                  |
| `commands/mysql_import.rs` legacy SQL restore                                                  | Blocking wait, bounded stderr tail, no live cancellation/deadline          | Contained client; existing legacy timeout/UI limitations remain                                                   |
| `utils/database_io.rs` query/dump                                                              | Query bounded wait; dump copy/wait and temporary publication               | Contained query/dump; no unrelated rewrite of dump IO                                                             |
| `utils/mysql_connection.rs` datadir query; `mysql.rs` list/admin; `security.rs` scalar queries | Mixed `.spawn` and `.output` paths                                         | All command builders now return the contained command type; `.output` gets bounded output/time                    |
| Persistent `mysqld.exe`, Apache, user terminals, Explorer                                      | Intentionally independent service/user processes                           | Not placed in a short-lived client job                                                                            |

One new `utils/mysql_process.rs` module wraps only client command creation and owns stdin/stdout/stderr, process and Job Object handles. The existing `windows-sys` **0.59** dependency enables additional API feature modules; no package version or lockfile upgrade occurred.

Windows 10+ `CreateProcessW` receives `PROC_THREAD_ATTRIBUTE_JOB_LIST` with a job configured for `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Assignment is part of creation, before client execution; there is no userspace spawn-to-assignment/resume interval. An explicit inherited-handle list contains only the three stdio handles. The job's owning handle is not inheritable and is retained until the operation's child is dropped. Errors fail closed with no ordinary-spawn fallback. RAII kills the job and waits on early return/unwind. Parent termination closes the owning handle in the kernel. Nested-job operation was tested on this host, not every enterprise parent-job policy.

The custom launcher passes an absolute `.exe` application path, CRT-quoted UTF-16 arguments, and an explicit Unicode environment block; it does not invoke a shell. Argument NULs are rejected. Pipes are drained by existing code. The unit tests cover quoted arguments, invalid assignment, noninheritance/membership, error exits, drop/reap, cancellation, output limits and timeouts.

References: [Windows process attributes and JOB_LIST support](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute), [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects). Rust's stable `Command` API does not expose the required process-attribute API in the toolchain used here, so the small Windows launcher owns the native creation call rather than using a post-spawn assignment.

## Server execution is distinct from client lifetime

In the repeated drill, a terminated client disappeared but the server's `SELECT SLEEP(12)` remained visible temporarily. The later UPDATE did **not** execute. A new full restore was rejected while another active statement or InnoDB transaction remained. After settling, explicit recovery succeeded.

`ensure_restore_server_idle` performs a conservative PROCESSLIST/INNODB_TRX observation through the pinned, datadir-verified connection. It fails closed if the query/parse fails. It is **not** another lock and cannot prevent an external client from beginning work after the check. It also does not prove the absence of every internal server background task. External writers must be quiesced for recovery; committed statements remain committed, and client termination is not rollback. The recovery journal remains discoverable after the drill rather than being deleted to make testing pass.

## Application lifecycle changes

- The real startup renders `RestoreRecoveryNotice`, using read-only `list_restore_recovery_records`. It discovers journal filenames without parsing their contents, running SQL, removing records or automatically restoring. An error is shown if discovery fails. The notice links to the existing full-backup folder and tells users to inspect partial state and explicitly recover.
- Native Quit, tray and window-close protections continue using the existing active-operation predicate. An additional Tauri `ExitRequested` guard covers ordinary event-loop exit requests.
- Tauri restart requests cannot be cancelled using `prevent_exit` in the installed dependency's implementation. The Windows updater can also directly exit. Frontend direct updater-install/process-relaunch capabilities have therefore been removed. `install_app_update` holds the **existing** database-operation guard through download, installer handoff and restart, verifies stopped services and passes the same progress events. Failures release the guard. No updater download/install was executed on the user's installation.
- No database screen or database workspace UI was redesigned. The startup notice is application-wide recovery presentation.

Affected source files in this pass: `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src-tauri/src/utils/{mod,mysql_process,mysql_connection,database_io}.rs`, `src-tauri/src/commands/{fullbackup,database_workspace,mysql_import,app_update}.rs`, `src-tauri/src/lib.rs`, `src/{App.tsx,lib/commands.ts,context/updater-context.tsx,components/restore-recovery-notice.tsx}`. Test additions: `src-tauri/examples/mysql_containment.rs`, `scripts/qualify-mysql-containment.py`, `scripts/qualify-containment-ui.py`, `src/components/restore-recovery-notice.test.tsx`, and native tests in the touched modules. Command reference updated. Earlier remediation edits in Apache/MySQL/migration remain separate inherited work.

## Execution environment and commands

Same-host disposable Windows x64, build 26300, NTFS D:, Rust 1.93.0, Node 24.22.1, Python 3.14.3, copied MySQL 8.4.11. Base source commit `63b17fd58e3cf475346192a0fa6c90df397f0fa3` with dirty remediation changes; final hashes/evidence are recorded alongside this report. Only marked `review-artifacts` installation/profile paths and synthetic `qual.sentinel` data are used. The persistent user installation is not an experiment target.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path src-tauri/Cargo.toml --release --example backup_qualification --example mysql_containment
& 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/mt.exe' -manifest scripts/backup-qualification.manifest '-outputresource:src-tauri/target/release/examples/backup_qualification.exe;#1'
python scripts/qualify-mysql-containment.py review-artifacts/backup-qualification-1793864703
./scripts/test-database-workspace.ps1
npm test
npx tsc --noEmit
npx vite build
cargo build --manifest-path src-tauri/Cargo.toml --release --features tauri/custom-protocol --bin devstackbox
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 start
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 state
```

An initial plain `cargo build --release --bin devstackbox` lacked `tauri/custom-protocol`, resulting in a localhost connection-error screen. It is a failed qualification setup, not a passing packaged-app startup. The corrected build embeds the frontend. No installer or signed update was produced.

## Native interruption evidence

`review-artifacts/backup-qualification-1793864703/containment-1793946918/results.json` records nine scenarios, their parent/client identities, process-handle death checks, SQL outcomes, settling and overlapping-restore rejection. `review-artifacts/containment-native.log` is the readable transcript. Windows process handles are held during death checks, avoiding PID reuse as proof. The nested case records its inner process chain separately.

| Scenario                                    | Observed result                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Forced termination before spawn             | No client created, original value retained                                                 |
| After atomic creation, before SQL streaming | Client exited on parent death; original retained                                           |
| During SQL after first UPDATE               | Client exited, value remained partial, later UPDATE absent                                 |
| After child completion                      | Completed value retained; child already exited                                             |
| Graceful cancellation                       | Client exited, partial SQL retained, lock released                                         |
| Timeout                                     | Client exited, partial SQL retained, lock released                                         |
| SQL error exit                              | Nonzero client result, original value retained, lock released                              |
| Nested Job Object                           | Nested contained launcher/client completed with expected synthetic SQL error               |
| Real full-restore interruption/recovery     | Recorded recovery ZIP restored original database and web file; interrupted record retained |

In four cases (forced streamed import, cancellation, timeout, full restore), a server statement remained temporarily active after the client exited; each competing full restore was rejected. The original full-restore recovery case used parent PID 40504/client PID 31468. These are historical identities, not instructions to terminate a current process.

Assignment failure is covered by a native test with an invalid job handle and a sentinel-writing child: creation fails and the sentinel is absent. “After creation but before assignment/resume” is not an exposed phase in this implementation: assignment is atomic in the Windows creation call. We do not label a nonexistent phase as an executed kill test. Kernel-level termination timing inside `CreateProcessW` is not directly instrumented.

## Real desktop recovery drill

The release-mode executable with embedded frontend was copied into the marked disposable installation. This exercised the real `run()` startup, WebView, command bridge, recovery notice and Settings → Backup & Restore. It was **not** an NSIS install and used a reduced runtime payload (MySQL present; Apache/PHP absent).

1. Launched the app with `DEVSTACKBOX_DATA_DIR` and `WEBVIEW2_USER_DATA_FOLDER` pointing to the isolated profile. The existing six recovery records were presented without replay.
2. Through the UI, restored `gui-interruption.zip`: first UPDATE writes `partial`, followed by `SLEEP(90)` and a final UPDATE to `late`.
3. During the actual “Restoring MySQL databases” stage, pressed Alt+F4. The app remained open and reported that a database operation was running. Evidence: `gui-containment/close-during-restore.txt`.
4. Terminated actual app PID 35880 using a Windows process handle after verifying its full executable path. Client PID 42492 exited; `forced-kill.json` asserts process-handle death and the `partial` value.
5. Restarted actual app PID 15564. Its startup displayed **seven retained recovery records**. After server work settled, SQL remained `partial`, the web sentinel was `original`, and no import was replayed.
6. Read retained record `restore-1793947690554.recovery.json`, then selected its exact `devstackbox-backup-before-restore-1793947690554.zip` in the real Backup & Restore UI. After explicit restore, queries and filesystem checks showed **database = original, web = original, no active statement**. The interrupted record remained present.
7. Alt+F4 after completion hid the window according to `minimizeToTray: true`; the app remained alive. Closed that isolated process for a fresh launch, then started actual app PID 39220. Original data remained unchanged and all seven records were still discoverable. This second termination is test cleanup, not proof of graceful Quit.
8. Stopped the isolated app and shut down its MySQL server using its configured port. A subsequent process inventory found no remaining test app/MySQL processes under `review-artifacts`.

Evidence directory: `review-artifacts/backup-qualification-1793864703/gui-containment/`. `restarted-app.txt`, `recovery-completed-ui.txt`, `restart-after-recovery.txt`, timestamped `state-*.json`, `forced-kill.json`, and startup logs retain the observations. The first restore click sequence did not produce a captured operation/result; only the second, observed partial-SQL run is counted. Transient post-click snapshots were refreshed before selecting further controls.

Additional exact commands:

```powershell
python scripts/qualify-backup.py
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 kill
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 restart
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 state
python scripts/qualify-containment-ui.py review-artifacts/backup-qualification-1793864703 stop
node scripts/validate-docs.mjs
git diff --check
```

GUI actions were performed with the computer-use tool; SQL/filesystem observations used the isolated helper above. No WebView injection or mock native-command bridge was used for this drill.

## Test results and identity

| Check                                     | Actual result                                                                                                                            | Evidence under `review-artifacts/`                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Rust library tests                        | **76 passed, 0 failed, 2 ignored**                                                                                                       | `containment-tests.log`                                                                          |
| Disposable database workspace integration | **1 passed** (`native_workspace_round_trip`), including import/export and credentials                                                    | `containment-workspace-integration.log`                                                          |
| Containment matrix                        | **9 scenarios passed**, plus native invalid-assignment regression                                                                        | `backup-qualification-1793864703/containment-1793946918/results.json`                            |
| Full backup/restore matrix                | **65 native invocations completed**: 3 backup/recovery roundtrip calls, 8 archive rejections, 27 phase/action cases, 27 harness restarts | `backup-qualification-1793947334/results.json`, `completed.txt`, `containment-backup-matrix.log` |
| Service/quit guards                       | **9 phase scenarios** rejected service-stop and native-Quit attempts                                                                     | Same matrix's `*-services.log` files                                                             |
| Malformed archives                        | **8 rejected**, before/after destination-content snapshots equal                                                                         | Same matrix's `rejection-state-*.json`                                                           |
| Frontend                                  | **17 files, 89 tests passed**; includes 3 new recovery-notice tests                                                                      | `containment-all-frontend.log`                                                                   |
| Clippy all targets                        | Passed with `-D warnings`                                                                                                                | `containment-clippy.log`                                                                         |
| TypeScript                                | Passed                                                                                                                                   | `containment-typescript.log`                                                                     |
| Vite / native release builds              | Passed; existing Vite >500 KB chunk warning remains                                                                                      | `containment-vite-build.log`, `containment-build.log`, `containment-app-build.log`               |
| Documentation                             | Passed: 31 screens + 9 non-route flows; 40 MDX/nav entries                                                                               | `containment-docs.log`                                                                           |
| Diff whitespace / scope review            | Passed whitespace check; reviewed changes against inherited remediation, no dependency version/signing/release/UI-workspace changes      | `containment-source-diff.patch` plus source manifest                                             |

The eight malformed archive fixtures cover oversized manifest, excessive entry count, duplicate path, traversal, ADS, link, CRC corruption and manifest/SQL mismatch. Aggregate decompression and streaming-budget enforcement use bounded/scaled native fixtures; this is not a 32 GB exhaustion test. The 27 harness restarts intentionally invoke no restore and remain **harness-level**, unlike the separate real desktop drill. The final web-publication cancellation still returned success after completion; it is counted as observed behavior, not a successful rollback/cancellation.

`containment-environment.json` records OS build **26300.9711**, display version 26H2 and exact tools. The Windows registry's ProductName reports “Windows 10 Pro”; the build number is the precise identifier used for this test. `containment-source-manifest.json` hashes changed tracked and untracked source files, and `containment-artifact-hashes.json` hashes executables and the tracked dirty diff. These identify the working tree beyond the base commit; neither represents a signed release candidate.

## Updated finding status

| Finding                                | Status after this pass                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-01 orphaned client                  | **Fixed and verified on this Windows host** for routed MySQL clients. Atomic job assignment, parent death, cancel, timeout, errors, nested jobs and real-app interruption verified. Server-side settling and partial commits remain separate requirements.                                |
| OQ-02 real startup / no replay         | **Partially verified**: actual packaged-executable startup after partial restore and after explicit recovery passed, with retained-record presentation. NSIS-installed startup, startup after an interrupted backup, actual tray Quit, signed updater restart and reboot remain untested. |
| OQ-03 completion-boundary cancellation | **Open**: final-phase cancellation may arrive after publication and return success. Best-effort semantics and both sides of the publication boundary still need explicit qualification.                                                                                                   |
| F01 lifecycle                          | **Partially verified**: existing owner retained; phase guards, client containment, real window-close guard and explicit recovery passed. Full installed/VM lifecycle qualification and cross-instance/external-writer limits remain.                                                      |
| F02 archive bounds                     | **Partially verified**: eight rejection/invariance fixtures and scaled bounds pass. Does not close F05 or establish arbitrary-size/resource-exhaustion resistance.                                                                                                                        |
| F05 filesystem race                    | **Open**: existing handle-relative confinement proposal remains unimplemented; no claim that repeated path checks eliminate TOCTOU races.                                                                                                                                                 |
| F08 release qualification              | **Open / no sign-off**: executable tested, no frozen signed installer/update candidate or clean-install/upgrade/uninstall/interrupted-upgrade VM evidence.                                                                                                                                |

New observations: server execution outlives the terminated client briefly (measured); restore must wait for settling. The existing close-blocked message directs users to Import & Export → Activity even for full restores in Settings; that wording is misleading and is recorded for a later UX pass. Recovery records intentionally remain after a separate successful recovery, so discovery does not prove that each listed interruption is still unresolved. No additional data-corruption finding was reproduced in this pass. Dependency/runtime advisory findings from the earlier audit remain outside this task and are not cleared.

## Limits and qualification gates

- F05 remains open. Handle-based filesystem confinement and adversarial junction swapping are not implemented. Containment introduces no new migration/extraction path but relies on existing validated backup/recovery paths and Windows executable lookup; it does not eliminate filesystem races.
- No destructive Windows reboot/shutdown, VM power cut, signed updater installation, or clean installer/upgrade/uninstall run was performed on this user host. No disposable VM provider was available through the inspected tooling. These remain VM-level qualification requirements, not passes.
- Actual packaged executable testing must be distinguished from native harness tests and from testing an NSIS-installed release candidate. No production-readiness sign-off is given.
- Legacy import/dump live cancellation/deadline gaps are not all addressed by this change. Job containment closes parent-death client survival; it is not a general server transaction cancellation mechanism.
- Shared external writers and second independent app instances remain outside the in-process lock. The server-idle check reduces interrupted-restore overlap risk but is an observation, not cross-process exclusivity.
