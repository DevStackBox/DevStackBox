# Changelog

All notable changes to DevStackBox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
