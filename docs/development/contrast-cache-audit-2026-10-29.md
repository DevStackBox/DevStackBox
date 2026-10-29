# Contrast and screen-cache audit — 29 October 2026

## Plan and implemented policy

Use explicit high-contrast foreground/background pairs for status badges, stronger secondary text, readable disabled controls and visible unchecked switches. Keep text labels so color is not the only status indicator. This improves readability; no application can guarantee readability on every miscalibrated monitor.

Reuse stable read results across tabs without adding timers. Keep existing live observers for running services, logs and databases. Invalidate affected stable reads at both ends of mutations, including failures that may partially apply. Do not indefinitely cache data that users can change outside the app.

## Screen inventory

| Screens | Data policy and outcome |
| --- | --- |
| Dashboard, Services, Apache/MySQL overview | ServiceStatusProvider remains authoritative for live process status. No additional command cache for status. Stopped badges now explicitly pair slate backgrounds and white text, reversed in dark mode. Shared bulk buttons retain disabled semantics with readable text. |
| PHP Overview, Versions, Extensions, project PHP selectors, startup | Shared session command cache for get_php_versions; five-minute on-demand expiry, one in-flight request for identical arguments. Overview to Extensions to Versions no longer repeats backend release lookup within that interval. Failed release results use only a 15-second retry window. |
| PHP Extensions | Cache extension lists by branch for five minutes; extension changes invalidate extension/config/history reads. Switching or installing PHP clears dependent runtime data. Explicit Refresh bypasses expiry. |
| Apache/MySQL/PHP config editors | Cache file and backup-list reads by service for one minute; Save/Restore/Backup invalidate the relevant entries. Reload bypasses the cache. Local unsaved drafts remain separate; no background cache refresh writes into the editor. |
| Projects and project details | Retain existing shared workspace query cache, mutation invalidation, bounded health checks and explicit Check health. Do not introduce a second cache for website responses. |
| Database list, users, details, Import & Export | Retain existing database/workspace caches and operation events. External phpMyAdmin changes still require bounded revalidation and return-from-tool refresh. Never cache credentials, mutation responses, import inspection or active jobs in the new stable-read cache. |
| Global/service Logs, archives, rotation | Live log cursor streaming remains unchanged. Archive and policy controls retain existing explicit reads/mutation updates; no additional TTL layer hiding external archive changes. |
| Settings | OS autostart read gets a one-minute cache and invalidation after set_autostart. App settings remain local state. Removed unrelated database-cache invalidation from set_app_settings. |
| Backup & Restore, XAMPP import | File lists/detection remain explicit reads; restores/imports invalidate stable PHP/config state. No cache for backup/restore operations. |
| HTTPS/SSL, Security | Keep trust/status and analysis reads fresh; these are diagnostic/security actions rather than stable data. |
| Terminal | Preserve sessions on navigation. No caching of terminal I/O or lifecycle commands. |
| About, updates | Existing system-info cache retained. Update checks retain their own provider lifecycle; not cached by the new command layer. |

## Resource and consistency controls

The new allowlist contains only five stable read commands, has no interval or focus timer, holds at most 100 entries (additional reads bypass storage if all entries are in flight), and uses memory only. Keys include arguments. Concurrent readers share one request; each receives its own cloned result. Invalidated in-flight responses cannot repopulate the cache or return stale results to waiting callers; those callers join a reconciled read. Manual refresh joins an already running request instead of spawning duplicates. Local mutations clear affected entries before and after the operation. External changes are observed at the next read after expiry or immediately through Refresh/Reload.

Existing workspace observers are intentionally retained: caching until an app mutation alone would miss service exits, phpMyAdmin writes and external filesystem changes. Permanent caching is not an appropriate policy for those screens.

## Contrast changes

- Stopped status: slate-700/white in light mode; slate-200/slate-950 in dark mode.
- Secondary text: 35% gray on light surfaces and 75% gray on dark surfaces.
- Dark primary buttons use the same darker blue as light primary buttons to preserve white-label contrast.
- Disabled buttons, inputs, selects, textareas and tabs no longer halve text opacity; muted surfaces and native disabled behavior distinguish them.
- Unchecked switches use a darker track and white thumb in both themes.

## Validation scope

Regression tests cover command deduplication, branch separation, TTL/manual refresh, targeted invalidation, mutation/read races, live-command exclusions and immutable returned data. Existing workspace cache tests remain applicable. No installer or release is produced by this change. Physical-monitor validation is not claimed.

Validation results: 86 frontend tests passed across 16 files; TypeScript and documentation validation passed. Measured primary-label and secondary/disabled-text pairs range from 5.23:1 to 9.44:1 across themes, above the 4.5:1 normal-text target.

Follow-up review: PHP extension controls are now disabled during refresh/toggle operations and have accessible names. Native-wrapper integration tests verify tab reuse, explicit refresh, version-change invalidation and partially failed config writes.
