# Changelog

All notable changes to DevStackBox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.19] - 2026-10-26

### Added

- **Log management:** Clear view with a session cursor, archive current log to verified GZIP, read-only archive preview and export, delete log contents with typed confirmation, and opt-in rotation/retention settings (automatic maintenance off by default).
- **Logs workspace** tabs: Apache, MySQL, PHP, and **Archives & rotation** with one shared policy for managed diagnostic logs.
- **Workspace cache** for Projects, Databases, and Users: show the last successful result when returning to a screen, with shared request deduplication and sensible polling.
- **PHP CLI launcher** (`bin/php.exe`): selects the configured default PHP on each invocation, uses the invoking user's configuration, and is added to machine PATH on install (existing PATH entries preserved).

### Changed

- phpMyAdmin installer payload is staged from policy: **pmahomme** theme only, smaller extracted footprint, hash-checked upgrade cleanup that preserves customized files.
- Service log viewer: action buttons above the viewer; clearer messaging after Clear view; service viewers link to shared archives/rotation instead of duplicating controls.
- Fresh PHP profiles get sensible default `sys_temp_dir` / `upload_tmp_dir` and common Laravel/WordPress extensions when unset; custom paths and existing extension choices are preserved.
- PHP Versions: **Default** and **Set as default** clarify global CLI/default vs per-project pinned runtimes.

### Fixed

- Clear view no longer reports an incorrect omitted-history warning when the user intentionally cleared the display.
- False Apache/MySQL **crash** toasts from short-lived version/diagnostic process probes (`httpd -v`, `mysql --version`, etc.).
- PHP Versions no longer shows **Not installed** while the default runtime is still being resolved.

## [0.1.18] - 2026-10-25

### Added

- **Database workspace** with **Databases**, **Users**, and **Import & Export** tabs: database details (overview, tables and views, access, backups), bulk selection, and visible manage, backup, export, and import actions.
- SQL and GZIP export and import with risk review, sequential batches, shared activity history, and cancellation.
- DevStackBox ZIP packages, saved backup records with integrity checks, reviewed restore, and full-server backup from the workspace.
- Database-level permissions editor and clearer MySQL account controls; improved stopped-MySQL and stale-cache empty states.

### Changed

- Database backup and restore workflows are centered in the workspace; legacy SQL backup entry points redirect where documented.

**Installer SHA-256:** `5A86AF4BC95D6683691A142C86820A9D95D93A2D17057A0EC42A2D18B5559B18`

## [0.1.17] - 2026-10-23

### Fixed

- Apache explicitly ignores ancestor .htaccess files unless a directory policy enables them. Laravel projects served from public/ no longer fail with parent .htaccess: <IfModule not allowed here under the default configuration. Public-directory rewrite rules remain enabled for HTTP and HTTPS.
- Existing Apache configurations receive an additive, syntax-checked migration with a timestamped backup; custom ports, site records and explicit directory policies are preserved.
- Replace the destructive legacy configuration test script with an isolated Apache regression test.

**Installer SHA-256:** `3128C4CAAAF8692E52E7A0EE68B7EF0ABF4FFBEC89FD224F505FF8B7AB0910AB`

## [0.1.16] - 2026-10-22

### Added

- **Restore from .sql** streams the file from disk into the MySQL client (no full-file load in the UI or Rust string APIs). Modes: follow dump database names, or target a database when the file does not select one-with honest partial-failure messaging and an operation lock.
- One-time migration of legacy PHP import limits (64M) to recommended values (512M upload, 544M post, 600s timeouts); custom limits are preserved. Optional **Apply recommended PHP import limits** on Databases → Backups.
- phpMyAdmin writable UploadDir/SaveDir/TempDir under user data; ExecTimeLimit 600 when still at bundled default.

### Changed

- Per-database and full-server mysqldump backups stream stdout to disk instead of buffering in memory.

### Removed

- `restore_mysql_database` (in-memory SQL string restore).

**Installer SHA-256:** `0D4F76EF10881E38F1DE28B3FA1023AEE550631099D03E7763375BF2D29A2BC6`

## [0.1.15] - 2026-10-22

### Fixed

- In-app updater progress no longer sticks at 50%: total download size is taken from the Tauri **Started** event instead of **Progress** events.
- Update dialog shows preparing, indeterminate download (unknown size), installing, auto-retry on transient network errors, and a manual **Retry update** action after failure.

**Installer SHA-256:** `1F899F796C06F3142E3BA118AD851ADA8EDEC8626E5BB888BDE3AABFBECD0C75`

## [0.1.14] - 2026-10-22

### Security

- Bundle PHP 8.3.36, fixing CVE-2026-109618 and CVE-2026-109619. Upgrade immediately; see the [PHP advisory](https://www.php.net/archive/2026.php#2026-10-21-5).
- Require patched upstream downloads: PHP 8.2.35, 8.3.36, 8.4.27 or 8.5.12 and newer patches on the same branch. Verify SHA-256 and the extracted runtime version before installation.
- Remove PHP 8.1 from the version manager and supported choices. Existing files are retained; migrate projects to a supported branch.
- Refuse Apache startup when the global runtime or an enabled project's pinned runtime needs a security update, with instructions to update it first.

### Fixed

- Show branch names and full installed/downloadable PHP versions separately in PHP Version Manager, matching the dashboard's branch and patch distinction.
- Offer patch updates for already-installed branches, including the active runtime. Preserve php.ini, stage replacements, and restore the previous runtime if publishing the replacement fails.
- Require DevStackBox Apache and affected PHP processes to be stopped for runtime updates; prevent Apache startup during the replacement.
- Keep installed patch versions and security warnings visible when release checks fail. Reject release builds with an outdated bundled PHP runtime.

### Upgrade notes

- The installer updates bundled PHP 8.3. Other installed branches must be updated separately in PHP Version Manager, including branches pinned to projects. Stop Apache and close PHP terminals before updating, then start Apache again.
- PHP 8.1 is no longer supported upstream. Exceptional source backports do not make old Windows binaries patched.
- Third-party extension DLLs are not copied into a new runtime. Install compatible extension builds if needed. User configuration outside the runtime is retained.

**Installer SHA-256:** `141BE50A133E7C0BDA19D281E447BA604DCBBF91B010B91B895C02AC55B7EADE`

## [0.1.13] - 2026-10-19

### Added

- Read Apache and PHP error logs directly from project details, with independent errors if either log cannot be read.
- Preserve pre-change virtual-host configuration copies in the configuration backups directory for manual recovery.

### Fixed

- Project diagnostics read the version-specific PHP error log for a pinned runtime instead of always reading the global PHP log.
- Stop site changes when generated virtual hosts are missing from saved records, while allowing deliberate removal, renaming and reconnection.
- Abort changes when recovery snapshots cannot be read; unreadable files are no longer treated as absent during rollback.
- Stage site configuration writes before replacement to avoid exposing truncated files to readers.
- Serialize configuration editor writes and full-backup restoration with site updates.
- Exclude the runtime operation lock from configuration backups and ignore it in older archives, allowing recovery backups while restoration owns the lock.

### Notes

- The displayed PHP selection is a saved setting, not a measurement of the running website. Logs are shared across sites using the same service/runtime; empty or old logs do not prove website health.
- Configuration backups do not provide a crash-atomic transaction across all files. Existing configuration mismatches are not automatically repaired.
- This release does not install or repair Laravel dependencies and does not claim to fix every HTTP 500 response.
- Windows Authenticode signing is pending. The installer may still display SmartScreen warnings. The separate Tauri updater signature verifies in-app updates.

**Installer SHA-256:** `C278038B57A0F4C7CDDAF7D38709E5DB03F3A05686EFF4D16BF2BCCBF17E1875`

## [0.1.12] - 2026-10-18

### Added

- Project details with hostname, folder, document root, aliases, health checks, and HTTPS controls.
- Per-project website PHP: choose a downloaded runtime or inherit the global default. HTTP and HTTPS use the same selection.
- Trusted local HTTPS with bundled mkcert, localhost and individual project certificates, repair and live verification.
- Connect existing folders outside www; suggest public/ for supported project layouts.

### Fixed

- Release metadata selects the exact versioned installer/signature pair and uses UTC timestamps.
- Manual upgrades stop owned services and check for locked binaries before replacing files; preserve project folders and stop safely when recovery is needed.
- Projects use one row per site. PHP choices show installed runtimes only.
- Website failures and TLS trust are reported separately; prevent startup HTTPS renewal from silently overwriting orphan site configuration.

### Scope

- PHP selection applies to website requests. The terminal still uses global PHP.
- Framework installers, project database linking, Git/SSH, and project-aware terminals remain future work. AI integration is deferred.
- Internal test builds numbered 0.1.13-0.1.15 were not public releases. These changes form public version 0.1.12.

**Installer SHA-256:** `E3F2F4CA76254F14DA52A02A17BC2B6FE9222C1861084CF0CE6172C849F292E3`

## [0.1.11] - 2026-10-17

### Changed

- Bundled **MySQL 8.4.11 LTS** and **phpMyAdmin 5.2.2** (fresh Windows zip bundles; data remains in `%LOCALAPPDATA%\\devstackbox\\mysql-data`)
- **Import from XAMPP** in Settings: copy `htdocs` into `www`
- Website and docs: XAMPP-alternative positioning, stack version copy, SEO landing pages
- CI uses `npm run check:ci` without local-only binary verification on GitHub runners

### Added

- `scripts/refresh-mysql-bundle.ps1` and `scripts/refresh-phpmyadmin-bundle.ps1` for maintainers
- Clean install checklist doc; winget manifest template; GitHub issue/PR templates

### Fixed

- phpMyAdmin login with empty MySQL `root` password (restored `config.inc.php` with `AllowNoPassword`; app seeds missing config on startup)

**Installer SHA-256:** `FAC8BDD8EBC08D362F37EC540931ABF455F12958DC7E13AA9F5939D9568FC415`

## [0.1.10] - 2026-10-17

### Added

- PHP **8.5** on the Versions page (on-demand download alongside 8.1, 8.2, and 8.4); **PHP 8.3** remains the only bundled default in the installer
- Release runbook and `scripts/release-build.ps1` for repeatable signed NSIS builds
- Expanded Vitest coverage; release verification scripts (`verify-release.mjs`, `build-release.mjs`)

### Changed

- MySQL/database pages: stopped-state UX, safer queries when MySQL is down, backup/restore improvements
- Service status: tray snapshot events, fewer false crash alerts, improved Start All / Stop All behavior
- Terminal: ConPTY shell fixes (CMD/PowerShell), theme sync, tab handling
- Installer: scrolling detail log during file extraction; machine-wide uninstall registration migration
- Monaco-based config editors; refreshed app icons and branding assets

### Fixed

- Port-aware Apache/MySQL status checks; phpMyAdmin URL resolution from config
- SQL-safe MySQL account/database operations; stored root password for CLI tools
- Dashboard, security scan, SSL, vhosts, and projects polish since v0.1.9

**Installer SHA-256:** `DE1A60568FA6FE1D2653009E7E3253303966D00F9CEFBD5665BC5FF70BFDF853`

## [0.1.9] - 2026-09-15

### Added

- Full audit remediation: MySQL user/database DDL validation; create/drop database from the Databases page
- Error boundary, channel-aware updater check (stable/beta endpoints from settings)
- Tray `service-status-snapshot`, batched process scan, `restart_all_services`
- Projects MVP (lists `www` folders), diagnostics export, port-aware status and phpMyAdmin URLs
- Minimal Vitest coverage; first-run MySQL root password prompt; mobile nav drawer

### Fixed

- MySQL start readiness polling and graceful shutdown via `mysqladmin`
- Async stop paths for Apache/MySQL (no blocking Tokio sleeps)
- Stored MySQL root password for CLI tools after UI password change
- Tray/service status sync, auto-start settings, minimize-to-tray on close
- Raw `invoke` replaced with `safeInvoke` on several pages; config/installer hardening
- Terminal tab state, theme sync, dashboard PHP service count, onboarding parallel start
- i18n and deduplicated helpers (`VhostEntry`, `formatBytes`)
- NSIS installer detail log panel was blank during file installation (`SetDetailsPrint textonly` → `both` in `hooks.nsh`, applied consistently at all silent-exec restore points); added component headers around the file-copy phase and richer install/uninstall summaries so the log now scrolls with real progress, matching the file-extraction status text

## [0.1.8] - 2026-07-23

### Added

- New DevStackBox branding and logo across the app, installer, and website
- One-click in-place upgrade dialog when installing a newer version over an existing install
- Automatic Apache and MySQL shutdown before upgrade file copy
- `www` folder preservation during upgrade when websites already exist
- Signed Windows NSIS installer with auto-update support (`latest.json` on GitHub Releases)
- MDX documentation structure synced to [devstackbox.com/docs](https://www.devstackbox.com/docs)

### Changed

- Installer details log: phase order, duration timing, summary copy, and spacing
- README install section uses evergreen GitHub Releases download link
- Expanded upgrade and installer documentation

### Fixed

- NSIS `DsbExecSilent` comma-split build failure in force-stop macro
- Negative install duration on systems with long uptime (`GetLocalTime`-based timing)
- Duplicate `Output folder` noise from redundant `SetOutPath` in PREINSTALL hook
- NSIS upgrade flow preserves user configs, MySQL data, SSL certs, and `www` projects

## [0.1.7] - 2026-06-01

### Added

- NSIS installer with professional deployment logs (7-phase install, 8-phase uninstall)
- Writing standards and documentation cleanup

### Changed

- NSIS-only bundle target (replacing MSI for Windows releases)
