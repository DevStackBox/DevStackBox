# Audit Reconciliation — 2026-09-15

**Purpose:** The 2026-09-15 external audit feedback ("DevStackBox — Audit Status Update & Installer Log Audit") scored the codebase at **26 done / 39 open** out of 65 original items. A pass against the actual v0.1.9 tree found the audit **overstated the "STILL OPEN" list** — roughly 15 of those items were already resolved by the time the audit was written (they were fixed in the same v0.1.9 remediation pass but not re-verified before the doc was drafted).

This file corrects the record. It does not replace [`docs/feature-status.mdx`](../feature-status.mdx), which remains the single source of truth for shipped/partial/planned status.

---

## Part 1 corrections — items marked "STILL OPEN" that are actually resolved

| # | Audit claim | Actual state in v0.1.9 tree |
|---|-------------|------------------------------|
| **#6** | `restartAllServices` non-atomic (stop + 750ms + start in `services.tsx`) | Uses [`restart_all_services`](../../src-tauri/src/commands/system.rs) Tauri command (atomic stop-then-start on the Rust side); `services.tsx:108-109` calls it directly. |
| **#11** | Update channel unused beyond a header | [`check_app_update`](../../src-tauri/src/commands/app_update.rs) selects the stable/beta endpoint from `app-settings.json`; [`updater-context.tsx`](../../src/context/updater-context.tsx) calls it instead of the raw plugin `check()`. |
| **#12** | Terminal theme doesn't update live | [`terminal-pane.tsx`](../../src/components/terminal-pane.tsx) has a `useEffect` keyed on `[isDark]` (~line 216-229) that updates `term.options.theme` at runtime. |
| **#15** | Dashboard ignores PHP in running count | [`dashboard.tsx`](../../src/pages/dashboard.tsx) counts `apache`, `mysql`, **and** `php`; denominator is `totalServices = 3`. |
| **#16** | No loading state / silent failure for dashboard vhost fetch | Dashboard vhost fetch now sets `vhostsLoading`, renders a skeleton, and shows a destructive toast on failure. |
| **#19** | No responsive/mobile sidebar | [`App.tsx`](../../src/App.tsx) adds a mobile nav overlay + hamburger button; [`sidebar.tsx`](../../src/components/sidebar.tsx) accepts `onNavigate` to close the drawer on route change. |
| **#26** | Duplicate `VhostEntry` interface | Centralized in [`types/vhosts.ts`](../../src/types/vhosts.ts); imported by both `dashboard.tsx` and `vhosts.tsx`. |
| **#27** | Duplicate `formatBytes` | Centralized in [`lib/utils.ts`](../../src/lib/utils.ts); imported by `backup.tsx` and `databases-list.tsx`. |
| **#29** | `onStatusesChange` deprecated prop still present | Removed entirely from [`service-manager.tsx`](../../src/components/services/service-manager.tsx). |
| **#33** | phpMyAdmin URL hardcoded | [`lib/phpmyadmin.ts`](../../src/lib/phpmyadmin.ts) resolves the URL from the Rust `get_phpmyadmin_url` command (port/SSL aware); used by dashboard, databases pages, and the tray. |
| **#35** | MySQL/Apache ports hardcoded | [`config_ports.rs`](../../src-tauri/src/utils/config_ports.rs) parses `Listen` / `port=` from the actual config files; status commands and phpMyAdmin URL resolution both use it. |
| **#39** | No database create/drop UI | `create_mysql_database` / `drop_mysql_database` commands wired into [`databases-list.tsx`](../../src/pages/databases-list.tsx) with dialogs. |
| **#42** | No log search/filter | [`log-viewer.tsx`](../../src/components/services/log-viewer.tsx) already has a search input filtering rendered lines. |
| **#48** | No diagnostics export | [`export_diagnostics_bundle`](../../src-tauri/src/commands/system.rs) command exists and is registered. |
| **#49** | Projects page is a placeholder | [`projects.tsx`](../../src/pages/projects.tsx) lists `www` folders via `list_www_projects`. |
| **#54** | Terminal tab close button visibility | [`terminal-tab-bar.tsx`](../../src/components/terminal-tab-bar.tsx) close button is now always visible (no longer hover-only / hidden on active tab). |
| **#55** | Onboarding hardcodes "PHP 8.3" | [`onboarding-dialog.tsx`](../../src/components/onboarding-dialog.tsx) accepts `activePhpVersion` prop, passed from `App.tsx`'s detected version. |
| **#63** | Onboarding starts services sequentially | `handleStartAll` now uses `Promise.all([startMysql, startApache])`. |
| **#64** | Clipboard API unhandled errors | [`mysql-service.tsx`](../../src/components/services/mysql-service.tsx) `copyConnectionString` now wraps `navigator.clipboard.writeText` in try/catch with a toast. |

**Corrected running total:** roughly **35+ of 65** items resolved, not 26. Percentage-complete framing in future audits should re-verify against the tree at audit time, not against an earlier snapshot.

---

## Part 1 — items confirmed genuinely still open

These remain accurate and are tracked for a future pass (not part of the installer-log rebuild):

- **#56 / #57** — [`terminal-context.tsx`](../../src/context/terminal-context.tsx): `createTab`'s `MAX_TABS` guard reads the outer `tabs.length` (stale-closure risk under rapid calls) instead of checking inside the functional `setTabs` updater.
- **#21** — Dual polling is reduced but not eliminated: tray emits a 5s `service-status-snapshot`, frontend still polls every 15s while visible as a fallback.
- **#13 / #36-38** — Hardcoded English strings remain in [`vhosts.tsx`](../../src/pages/vhosts.tsx) (e.g. "System Virtual Hosts", "Refresh", table headers).
- **#17** — Sidebar `NavLink` only sets `end` on `/`; nested `/services/apache/*` routes may not visually keep the parent item highlighted. Needs UI verification.
- **#23** — [`list_mysql_databases_detailed`](../../src-tauri/src/commands/mysql.rs) still issues two `mysql` client invocations server-side (a `GROUP BY` query plus a `SHOW DATABASES` fallback for zero-table databases). Not a frontend round-trip issue, but could be merged into one query.
- **#14, #20, #24, #30, #34, #40, #41, #43-47, #59-62** — Unchanged; roadmap/architecture/a11y items out of scope for this pass.

---

## Part 2 — Installer detail-log panel (confirmed accurate)

The audit's root-cause analysis for the empty NSIS detail panel was **correct**: [`hooks.nsh`](../../src-tauri/nsis/hooks.nsh) sets `SetDetailsPrint textonly` in `SetLogNormal` and restores the same `textonly` mode after every silent `nsExec::Exec` call, so `DetailPrint` output and automatic `File` extraction lines never reach the scrolling detail panel — only the status line above it.

Fixed in this pass:

1. `SetLogNormal` → `SetDetailsPrint both`.
2. All post-silent-exec restore points (`DsbExecSilent`, `DsbForceKillImageUnderInstDir`, `DsbProcessRunningUnderInstDir`, `un.DsbProcessRunningUnderInstDir`, `DsbStopNamedService`, `un.DsbStopNamedService`) now restore to `both` via a shared `SetLogRestore` macro.
3. Component-level `DetailPrint` headers added around the resource/binary `File` loops in [`installer.nsi`](../../src-tauri/templates/installer.nsi) so the scrolling extraction log has readable section breaks.
4. `NSIS_HOOK_POSTINSTALL` and `InstallSummary` in `hooks.nsh` expanded with clearer per-service confirmation lines.

See [`CHANGELOG.md`](../../CHANGELOG.md) for the v0.1.9 rebuild note.
