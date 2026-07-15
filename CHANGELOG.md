# Changelog

All notable changes to DevStackBox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.8] - 2026-06-09

### Added

- One-click in-place upgrade dialog when installing a newer version over an existing install
- Automatic Apache and MySQL shutdown before upgrade file copy
- `www` folder preservation during upgrade when websites already exist

### Changed

- Installer details log: phase order, duration timing, summary copy, and spacing
- README install section uses evergreen GitHub Releases download link

### Fixed

- NSIS `DsbExecSilent` comma-split build failure in force-stop macro
- Negative install duration on systems with long uptime (`GetLocalTime`-based timing)
- Duplicate `Output folder` noise from redundant `SetOutPath` in PREINSTALL hook

## [0.1.7] - 2026-06-01

### Added

- NSIS installer with professional deployment logs (7-phase install, 8-phase uninstall)
- Writing standards and documentation cleanup

### Changed

- NSIS-only bundle target (replacing MSI for Windows releases)
