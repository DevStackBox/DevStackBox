# Shared workspace cache plan

Date: 2026-10-26. Status: shipped in v0.1.19.

## Implementation notes

`WorkspaceCache` and `useWorkspaceQuery` provide shared session entries, pending-request deduplication, revision checks, completion-based polling and error backoff. Projects, project details, dashboard vhosts, database names/statistics, users, database details and collation choices use these entries. Polling is subscription-driven and pauses on blur/hidden state; expensive project diagnostics use entry/focus/manual refresh rather than a recurring timer. Database-job history polls only while a job is active and the app is focused/visible.

The data-profile root is fixed for the native process, so memory entries cannot cross app launches or profiles. MySQL port/PID/lifecycle changes and credential/config mutations invalidate session entries without an extra identity query. Account data is hidden after an authentication failure. No disk cache or new background server-identity polling was added.

Confirmed mutations trigger shared reconciliation; current lists are not optimistically fabricated. This deliberately uses the server's returned state rather than pretending newly created database statistics are zero. Imported SQL, including partial/failed/cancelled imports, invalidates database and account metadata when the job settles. Exports do not invalidate database metadata. On return from phpMyAdmin, active database consumers revalidate once.

Project drafts survive refresh. A fresh configuration comparison detects changes before saving; grant updates also compare the originally reviewed grants in the native command. These checks are not a transaction with external editors/SQL clients: an external writer can still race the subsequent write. Fresh backend validation remains necessary.

The cache keeps roughly 200 resources by evicting inactive, unobserved entries as new keys arrive; active entries are not evicted. Tests cover request deduplication, navigation reuse, invalidation races, hidden/inactive polling, error backoff and identity resets. The policy below documents intended behavior and tuning values, not a promise of instantaneous external synchronization.

## Goal

Returning to Projects, Databases or Users should show the last successful result immediately. Background refresh must not blank the screen, reset editing forms or present old checks as current facts. Changes through DevStackBox should update related screens promptly; changes through phpMyAdmin, terminals and other clients must be detected through reconciliation.

## Findings before implementation

- `src/components/sites-workspace.tsx` stores projects, vhosts, hosts entries and SSL results locally. Every mount starts a load and clears health. Configuration warnings and SSL checks follow the list requests, keeping the checking state active longer.
- `src/pages/project-details.tsx` reloads the vhost list, PHP versions and diagnostics on mount. It clears diagnostics and logs, and ordinarily resets the editing draft.
- `src/context/database-cache-context.tsx` already retains database metadata in memory and rejects superseded responses. However, it has no freshness window or shared pending-request deduplication. The list page requests a refresh on every mount. Its current scope reset uses the MySQL port alone.
- `src/pages/mysql-users.tsx` keeps users locally and reloads on mount. Successful account mutations reload that page, rather than invalidating a shared account cache.
- Database operation history polls every 1.5 seconds even when idle. Every active-to-idle transition refreshes database metadata, including read-only backups/exports. Imports may also change users and privileges, so refreshing only databases is insufficient.
- Database names and relatively expensive table/view/size aggregates currently come from one detailed metadata query.

## Architecture

Use one shared query-cache mechanism with separate entries for each resource. Extend the existing providers rather than introduce competing localStorage caches in each page. Keep the first implementation memory-only, mounted above route changes. This fixes repeated navigation without persisting usernames, local paths or obsolete health results across launches.

Each entry tracks data, whether a successful result exists (including an empty list), last successful fetch time, invalidation revision, refresh state, error and one pending request. Expose `ensureFresh`, explicit refresh, invalidate and confirmed mutation-update operations. Consumers subscribe to entries; they do not own separate fetching effects.

Use a shared pending promise per key. Concurrent list pages, dialogs and dashboard consumers must await the same query. If an invalidation occurs while a request is pending, reject its obsolete result and schedule one follow-up read. A late response must never resurrect a deleted row or overwrite data from a different connection.

Cache keys include backend-provided application data-profile identity and connection identity, not merely a port. Include server host, port, data directory/server identity where available, account identity and credential revision. Never include a password. Project entries use stable project IDs and configuration revisions. Invalidate before replacing connection credentials; clear sensitive account/grant data on authentication or identity changes. Runtime restart invalidates MySQL metadata even when the port is unchanged.

## Initial freshness policy

These are starting values to tune after profiling, not guarantees of instantaneous synchronization.

| Resource                                         | Freshness                    | Reconciliation while relevant screen is visible                            |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| Project/vhost list, www discovery, hosts mapping | 30 seconds                   | Every 30 seconds; debounce known configuration events                      |
| Project SSL/configuration diagnostics            | 60 seconds                   | Only for visible project/detail; at most two expensive checks concurrently |
| Database names                                   | 15 seconds                   | Every 15 seconds                                                           |
| Database counts and estimated sizes              | 60 seconds                   | Every 60 seconds; split from the lightweight names query                   |
| MySQL users                                      | 30 seconds                   | Every 30 seconds on Users                                                  |
| Database details/tables                          | 30 seconds                   | Only while that detail page is visible                                     |
| Grants                                           | Load fresh when editor opens | Never silently replace a dirty permission draft                            |
| Installed PHP versions and collations            | 5 minutes                    | Invalidate immediately on runtime/server changes                           |

Navigation inside the freshness window performs no redundant read. Stale entries render immediately and request one background read. Returning focus to the app revalidates relevant entries, throttled to avoid focus storms; returning from phpMyAdmin requests one revalidation even if the usual freshness window has not expired. Manual Refresh always requests a live result, joining an already valid pending request rather than creating a parallel one.

Pause scheduled refresh when the window is hidden/minimized or the relevant screen has no subscribers. Resume with a stale check. Use a completion-based timer so slow requests cannot overlap; back off after repeated errors. Avoid expensive periodic project HTTP probes: list visibility does not require running every full diagnostic. Service status remains owned by the existing service provider.

## External changes, including phpMyAdmin

There is no automatic event from arbitrary SQL clients to this desktop cache. Do not rely on phpMyAdmin integration hooks, MySQL filesystem timestamps or a database-wide last-modified timestamp.

Use lightweight live queries plus focus refresh. While the Databases screen remains visible and MySQL responds, an externally created/deleted database should normally appear at the next 15-second names check plus query time. Users reconcile on their 30-second interval. Hidden screens are not promised live synchronization; they reconcile on return. Statistics may update later than names and need their own timestamp.

Filesystem events for DevStackBox configuration can accelerate project refresh, but watchers are supplementary: atomic file replacements, missed events and external filesystem changes still require focus/periodic reconciliation. Do not recursively watch every project dependency directory. Missing project folders are reported as unavailable, not silently removed from the registered project list.

## Mutation invalidation matrix

| Confirmed action                                          | Cache update/invalidation                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create database                                           | Add confirmed name immediately; invalidate summary/details and reconcile names. Unknown statistics stay unknown, not fabricated zeroes.                                                        |
| Drop database                                             | Remove confirmed name and associated detail/selection entries; invalidate summary and grant displays. MySQL can retain grants for a dropped schema, so do not assume permissions were deleted. |
| Import/restore, including failed or cancelled runs        | Invalidate databases, statistics, users and grants because arbitrary SQL can have partial effects beyond its initial target. Reconcile after the operation settles.                            |
| Export/backup                                             | Refresh backup records/history only. A read-only export does not itself invalidate database metadata.                                                                                          |
| Create/drop user                                          | Update confirmed username+host entry; invalidate account/grant views.                                                                                                                          |
| Password change                                           | Invalidate account metadata; if this is the application's connection account, update connection revision and revalidate that scope. Never store password text in the cache.                    |
| Grant change                                              | Invalidate that account/database grant data and affected Access panels.                                                                                                                        |
| Connect/edit/remove project, change root/domain/PHP/HTTPS | Update confirmed configuration; invalidate project diagnostics, hosts mapping and related dashboard/vhost views.                                                                               |
| Apache restart/config changes                             | Invalidate relevant project health without clearing project configuration rows.                                                                                                                |
| MySQL restart, port/profile/account switch                | Mark metadata stale on restart; clear entries on identity changes; reject all old in-flight responses.                                                                                         |

Perform updates after backend success rather than optimistically claiming success. A failed command may still have partially changed state: reconcile affected resources after ambiguous failures. Coalesce multiple invalidations from one batch into one refresh per affected resource.

## UI behavior

- First load without cached data: show a lightweight skeleton for that section only. A fresh successful empty result shows the actual empty state.
- Cached data: keep rows visible and usable for navigation; show “Updating…” unobtrusively with the last successful check time.
- Refresh failure: retain last good display with “Could not refresh - showing data from …” and Retry. Never replace a failed response with an empty list.
- Separate “Last checked” health from current service status. An old healthy project badge becomes “Last check passed” or “Needs recheck” after relevant changes; cached health must not claim the website is currently reachable.
- When MySQL is stopped, keep database names visibly marked stale and block live operations. Do not query MySQL while stopped/starting/stopping. Restart triggers one reconciliation for interested resources.
- Account/grant data receives stricter handling: hide it on authentication failure or connection identity changes. Cached permissions never authorize an action.
- A refresh must not change search, selection, scroll position or unsaved fields. Remove selections for deleted resources only after a successful current response. Show conflicts when an edited project/account was changed externally.
- Permission save needs fresh backend comparison against the original reviewed grants; changed grants require review again. Database deletion/import review also needs current target validation at execution time. Cached data is presentation, never validation.
- Keep manual Refresh for immediate verification and troubleshooting.

## Operation history optimization

Poll at the current short interval only while jobs are active. When idle, refresh on workspace entry/focus and native job events, with a slower fallback if events are unavailable. Track newly settled operation IDs and kinds, rather than only a global active-to-idle boolean. This handles partial failures, multiple jobs and imports completed while another job remains active. After app restart, interrupted imports also trigger metadata invalidation when the connection becomes available.

## Implementation order

1. Add the common cache-entry behavior and connection/profile scoping, with lifecycle and race tests.
2. Migrate Projects and Project Details; split configuration loading from expensive diagnostics and protect dirty drafts.
3. Extend the database provider with freshness, deduplication and separate names/statistics; migrate Users, selectors and permission read models to shared entries.
4. Wire confirmed mutations, import settlement and native lifecycle events into invalidation. Replace unconditional mount refreshes with `ensureFresh`.
5. Add visible-screen timers, app-focus reconciliation and error backoff. Optimize idle operation-history polling.
6. Verify UI transitions, document consistency windows, and measure actual IPC/query reductions before considering optional disk persistence.

## Acceptance tests

- Navigate away/back repeatedly: no blanking or extra queries inside the freshness window.
- Concurrent consumers: one request per key, all callers await completion.
- Empty result is cached; failed refresh retains successful data and timestamp.
- Mutation during a slow query cannot resurrect deleted entries; invalidation produces one follow-up read.
- Profile/port/account switch and MySQL restart reject obsolete responses; equal ports across profiles never share data.
- External create/drop through phpMyAdmin or CLI appears on scheduled/focus reconciliation, including when the application did not initiate it.
- Failed/cancelled imports reconcile partial changes to schemas and accounts; backups do not trigger unnecessary metadata reloads.
- Stopped/hidden/inactive screens do not issue periodic database queries; focus storms and long queries do not overlap requests.
- Unsaved project and grant edits survive background updates; external conflicts are surfaced before writes.
- Project health never remains labelled current after Apache/config changes; a missing directory does not erase its registration.
- Native audit covers first load, cached return, background refresh, offline/error, external changes and editing conflicts. Report actual query counts and latency instead of promising zero database checks.

## Recommended scope

Implement session caching first. Keep the app's initial live check on launch, but avoid repeating blocking checks on navigation. Persistent disk caching can be a later opt-in improvement if launch measurements justify it; it needs schema versioning, bounded retention, profile isolation and clear stale-data presentation.
