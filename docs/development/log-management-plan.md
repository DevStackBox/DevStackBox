# Log clearing, rotation and archives

Date: 2026-10-26. Status: safe stopped-writer implementation completed and installed-app audit passed for the workflows documented in [the audit report](installed-ui-audit-2026-10-26.md). Live service rotation remains future work.

## Implemented scope

The shared viewer now uses incremental bounded reads and a persistent per-session cursor for Clear view, with late-response protection and idle/focus-aware polling. Log-file selection, verified GZIP archives, read-only previews, full archive export, typed deletion confirmation, and opt-in rotation/retention settings are available. Maintenance runs at startup, after service-stop attempts and every five minutes, separate from UI polling. Source contents are preserved if compression or verification fails; Windows exclusive handles reject active writers.

Automatic deletion is disabled by default. The implementation uses safe stopped-writer archival for Apache, MySQL and PHP, and a shared lock for app crash logs. It does **not** enable live service-native rotation: the Apache piped logger and MySQL reopen proposals below remain future work requiring their own Windows lifecycle acceptance tests. No blanket copy/truncate of a live writer is used. Compression failures can leave partial recovery files, which retention deliberately does not delete.

The remaining sections record the design and acceptance criteria. See the user guide for current behavior.

## Original cause of Clear appearing broken

Before this change, `src/pages/services/_shared/workspace-log-viewer.tsx` passed `onClear={() => setLogs("")}`. This cleared only React state. Its two-second auto-refresh then reread the unchanged file. The native `logs.rs` exposed reading and crash-event append commands, but no cursor-based clearing command.

The reader already bounds the displayed tail to 512 KiB and 1,000 lines. That protects the viewer from reading an entire large file, but does not limit disk growth. A bounded tail is not rotation.

## Recommended user-facing actions

- **Clear view:** hide entries up to a recorded file identity/byte offset. Keep auto-refresh enabled and display only subsequent entries. “Show recent history” resets this view filter. Do not pretend this frees disk space.
- **Archive current log:** preserve old entries and start a new active file using a service-aware procedure. Show any required interruption before proceeding. If the writer cannot safely reopen, offer to archive after the user stops the service.
- **Delete log contents…:** secondary destructive action with explicit file/scope confirmation. Prefer Archive current log for normal housekeeping. Do not report success until the backend confirms the actual operation.
- **Archives:** show service/runtime, timestamp, size and compression; allow bounded viewing, export, opening the directory and explicit deletion. Clearly separate active files from archives.

The current ambiguous Clear button should become Clear view first. It must not unexpectedly become permanent deletion under the same label.

## One log registry

Resolve logical identifiers to actual managed log paths on the backend. Include Apache error/access, MySQL error, global PHP, each pinned PHP runtime, and DevStackBox crash logs. Show the actual filename in the UI. Custom paths outside the managed directory can be viewed only through validated configuration resolution; keep automatic rotation disabled there until explicitly supported.

Do not accept arbitrary frontend paths for deletion or archival. Reject symlink/junction escapes, directory targets and unknown identifiers. Distinguish missing file, empty file, permission failure and locked file. Exclude MySQL binary/relay/redo/undo logs, database files and PID files: these are not ordinary diagnostic text logs.

## Rotation strategy

Avoid a universal copy-then-truncate implementation: a writer can append between the copy and truncation, losing entries. Renaming a file also does not guarantee its writer starts writing to a new one, especially on Windows.

| Writer | Approach |
| --- | --- |
| Apache | Evaluate the bundled `rotatelogs` with managed piped error/access logs. Validate Windows quoting, process lifecycle, startup failure behavior and active-file discovery before enabling. Existing custom logging configuration must remain intact. |
| MySQL | Use a validated error-log rename/reopen sequence with the narrow `FLUSH ERROR LOGS` operation where supported. Avoid broad `FLUSH LOGS`, which affects other log classes. Windows locking and the configured error sink must be tested; otherwise queue archival until a controlled stop. |
| PHP | Rotate after a confirmed safe writer shutdown initially. Apache PHP and CLI PHP may both write; do not assume stopping Apache closes all PHP writers. Defer or report a lock instead of truncating around it. |
| DevStackBox crash log | Serialize append and rotation under one native lock. App-owned writers make this the simplest first rotation implementation. |

Phase one should support safe stopped-service archival and app-owned log rotation. Live Apache/MySQL rotation is a separate acceptance gate, not an assumption.

## Retention defaults to review

- Rotate eligible active diagnostic logs at 20 MiB, or on the next safe opportunity. Consider daily boundaries only when the file is nonempty.
- Keep archives for up to 14 days, at most 10 per log, and at most 200 MiB across managed archives. Apply the earliest limit; show the active policy before enabling automatic deletion.
- Compress closed archives to GZIP in a background task. Write a temporary file, validate completion, then publish it; only remove the original closed archive after successful publication. Skip compression if disk headroom is insufficient.
- Use UTC timestamps plus a unique suffix to avoid collisions; display local time in the UI. Preserve metadata recording the source, original size, creation time and checksum.
- Retention deletes only known, closed archives. Never remove the active log or unrecognized files to satisfy a quota. If safe rotation cannot run, show an oversized-log warning; do not claim a hard bound on active file size.
- When DevStackBox is closed, its own scheduler cannot rotate logs. Service-native rotation can continue independently; app-owned maintenance resumes on next launch. State this limitation clearly.

## Resource-efficient viewer and maintenance

- One pending read per selected log; share it between views of the same source.
- Read increments using file identity and byte offset, returning bounded chunks. Detect truncation/rotation and reset safely; preserve incomplete UTF-8/line boundaries.
- Poll only the visible selected log while auto-refresh is enabled. Pause while hidden/minimized; back off when unchanged or on repeated errors. A request finishing late must not replace a newly selected service's content.
- Clearing the view advances its cursor and request generation, so an older read cannot refill it. Rotation resets the cursor to the new file while preserving the clear-view intent.
- A single low-frequency maintenance task checks metadata, not whole file contents. Initially run at startup, after service stops and every few minutes while the app is open. Do not launch a compressor or scan archives on every two-second UI refresh.
- Limit archive compression to one job, keep file handles short-lived, and make retention/compression independent of scrolling and searching.

## Failure and recovery rules

Use a per-log lock for archive/delete operations. Verify source identity before acting, publish archives without overwriting existing files, and retain recovery evidence after interruption. If renaming succeeds but reopening fails, report the active writer state and archive location; never show a generic success toast. On disk-full/access-denied errors keep the source and explain what did not complete.

Never upload logs automatically. Logs may contain local paths, SQL or credentials; exporting remains an explicit local action. Manual archive deletion is separate from deleting a database or project.

## Implementation order and tests

1. Correct Clear view semantics and add file metadata/cursor responses to the reader.
2. Add stopped-service archive management, retention settings and serialized crash-log rotation.
3. Add Windows-tested live Apache/MySQL rotation; preserve custom configurations and explain any required restart.
4. Add archive browsing/compression and update documentation/screenshots.

Test continuous writers with sequence-numbered lines, old responses arriving after Clear, rotation during reads, concurrent viewers, locked files, denied access, missing/empty logs, disk-full/archive-publication failure, symlink escapes, non-ASCII text, service restarts and app shutdown. Verify no lost lines for workflows advertised as lossless and no unintended MySQL log-class changes. Measure idle polling/CPU and large-log memory use.

## Primary references

- [Apache rotatelogs](https://httpd.apache.org/docs/2.4/programs/rotatelogs.html).
- [MySQL 8.4 error-log flushing and renaming](https://dev.mysql.com/doc/refman/8.4/en/error-log-rotation.html).

The implementation does not rewrite service logging configuration. Existing logs change only through an explicit archive/delete action or an enabled maintenance policy.
