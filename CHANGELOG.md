# Changelog

All notable changes to DevStackBox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2024-12-18

### Fixed
- **MSI Compatibility**: Fixed version format from `0.1.0-alpha.6` to `0.1.6` for MSI bundler
- **File Structure**: Resolved accidental deletion of critical files (`globals.css`, `main.tsx`)
- **GitHub Actions**: Fixed emoji encoding issues causing PowerShell parsing errors
- **CSS Pipeline**: Restored complete Tailwind CSS compilation (27.60 kB output)

### Added
- Both MSI (288.9MB) and NSIS (147.7MB) installers now available
- Multilanguage support (English & Hindi) with i18next
- Theme switching (dark/light mode)
- MySQL service management with GUI controls
- phpMyAdmin integration
- Basic configuration management

### In Progress
- System tray integration
- Auto-updater functionality
- Logs viewer
- Bug reporting via GitHub Issues

### Planned
- Apache HTTP server integration
- Multiple PHP version support
- One-click app installers (WordPress, Laravel, etc.)
- Config editor with Monaco
- Database backup/restore
- Project management
- Security analyzer
- Mail testing tools

## [0.1.0-0.1.5] - Previous Versions

Early alpha releases with basic functionality and architecture setup.

---

For detailed release notes, see [GitHub Releases](https://github.com/ProgrammerNomad/DevStackBox/releases)
