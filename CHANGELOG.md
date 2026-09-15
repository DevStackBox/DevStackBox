# Changelog

All notable changes to DevStackBox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
