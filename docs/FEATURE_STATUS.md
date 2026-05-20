# DevStackBox - Feature Status

**THE single source of truth for what is built, what is in progress, and what is planned.**  
Update this file every time a feature changes status. Do not maintain feature status in README.md, TODO.md, or CHANGELOG.md separately - those should reference this file.

**Last Updated:** May 2026  
**Current Version:** v0.1.6

---

## Roadmap Phase Status

| Phase                        | Status | Notes                                                                                                                                                                                                                                                     |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 - Core Stability     | DONE   | Items 1.1-1.8 complete. `cargo check` and `cargo clippy -D warnings` both clean.                                                                                                                                                                          |
| Phase 1.8 - User Data Root   | DONE   | Runtime data now lives in `%LOCALAPPDATA%\DevStackBox\` (override via `DEVSTACKBOX_DATA_DIR`).                                                                                                                                                            |
| Phase 2 - Modularize Backend | DONE   | `lib.rs` reduced to ~150 lines. Commands split into `commands/{mysql,apache,php,config,logs,system,tray}.rs`; helpers in `utils/{paths,process}.rs`; shared types in `types.rs`; default web templates in `src-tauri/templates/`. Build and clippy clean. |

---

## Status Key

| Symbol  | Meaning                                              |
| ------- | ---------------------------------------------------- |
| DONE    | Fully working and tested                             |
| PARTIAL | Code exists but has bugs or incomplete functionality |
| STUB    | UI exists but backend does nothing real              |
| PLANNED | Not started, on the roadmap                          |

---

## Core Infrastructure

| Feature                        | Status  | Notes                                                                                                                         |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 setup                  | DONE    | v2.1, tray-icon, updater plugins                                                                                              |
| Vite + React 18                | DONE    |                                                                                                                               |
| Tailwind CSS                   | DONE    | v3, compiled to ~27KB                                                                                                         |
| shadcn/ui                      | DONE    | Components in `src/components/ui/`                                                                                            |
| Framer Motion                  | DONE    | v11                                                                                                                           |
| i18next (EN + HI)              | DONE    | `locales/en.json` and `locales/hi.json`                                                                                       |
| Dark / Light mode              | DONE    | Tailwind + shadcn theme system                                                                                                |
| safeInvoke() wrapper           | DONE    | Browser mode fallback works                                                                                                   |
| MSI installer                  | DONE    | 288.9 MB                                                                                                                      |
| NSIS installer                 | DONE    | 147.7 MB                                                                                                                      |
| GitHub Actions CI/CD           | DONE    | Builds on push to main                                                                                                        |
| App version constant           | DONE    | `src/lib/version.ts`                                                                                                          |
| Shared TypeScript types        | DONE    | `src/types/services.ts`                                                                                                       |
| TAURI_COMMANDS constants       | DONE    | `src/lib/commands.ts` grouped (system/services/php/config/tray); zero hardcoded command strings remain in frontend components |
| Bundled stack (Apache+PHP+DB)  | DONE    | All core binaries ship in installer - no internet required                                                                    |
| First-launch onboarding screen | PLANNED | Show Apache/PHP/MariaDB ready status after install, then "Start"                                                              |

---

## Service Management

| Feature                    | Status  | Notes                                                                                   |
| -------------------------- | ------- | --------------------------------------------------------------------------------------- |
| MariaDB start / stop       | DONE    | `start_mysql`, `stop_mysql` commands work (command names reference mysql by convention) |
| MariaDB status check       | DONE    | Polls process list for `mysqld.exe`                                                     |
| MariaDB version detect     | DONE    | Reads `mysqld --version`                                                                |
| MariaDB data init          | DONE    | Auto-initializes if data dir missing                                                    |
| MariaDB config auto-create | DONE    | Creates `config/my.cnf` if missing                                                      |
| Apache start / stop        | DONE    | `start_apache`, `stop_apache` commands work                                             |
| Apache status check        | DONE    | Polls process list for `httpd.exe`                                                      |
| Apache config test         | DONE    | `test_apache_config` runs `httpd -t`                                                    |
| Apache config auto-create  | DONE    | Creates `config/httpd.conf` if missing                                                  |
| Apache 32-bit detection    | DONE    | Warns user if 32-bit Apache on 64-bit build                                             |
| PHP status check           | DONE    | Checks if `php/8.3/php.exe` exists                                                      |
| PHP as service start/stop  | STUB    | `toggle_php` returns true immediately                                                   |
| PHP CGI / FastCGI          | PLANNED | Apache integration with PHP not tested                                                  |

---

## Service UI

| Feature                  | Status  | Notes                                  |
| ------------------------ | ------- | -------------------------------------- |
| ServiceManager component | DONE    | Polls status every 5 seconds           |
| ServiceCard component    | DONE    | Generic card for service display       |
| StatusBadge component    | DONE    | Running/Stopped indicator              |
| ServiceActions component | DONE    | Start/Stop/Open buttons                |
| MariaDB service UI       | DONE    | `mysql-service.tsx`                    |
| Apache service UI        | DONE    | `apache-service.tsx`                   |
| PHP service UI           | DONE    | `php-service.tsx`                      |
| Services page            | PARTIAL | Start/stop works, logs are incomplete  |
| Dashboard page           | DONE    | Shows service overview and quick stats |

---

## Config Management

| Feature                       | Status  | Notes                                |
| ----------------------------- | ------- | ------------------------------------ |
| Read config file              | DONE    | `read_config` command                |
| Write/save config file        | DONE    | `update_config` command              |
| Auto-backup before save       | DONE    | Saves to `config-backups/`           |
| Manual config backup          | DONE    | `backup_config` command              |
| List config backups           | DONE    | `list_config_backups` command        |
| Restore config backup         | DONE    | `restore_config_backup` command      |
| Config editor UI (textarea)   | DONE    | `config-editor.tsx` - basic textarea |
| Config editor (Monaco)        | PLANNED | Syntax highlighting, line numbers    |
| Config validation (Apache -t) | PLANNED | Run config test before save          |
| Config validation (MariaDB)   | PLANNED |                                      |

---

## Log Viewer

| Feature                         | Status  | Notes                                                                                                                                  |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Read log file (last 1000 lines) | DONE    | `get_service_logs` command                                                                                                             |
| LogViewer component (static)    | DONE    | Renders text, no streaming                                                                                                             |
| Log display on services page    | PARTIAL | Calls `get_service_logs` but UI is basic                                                                                               |
| Real-time log streaming         | DONE    | Frontend polls `get_service_logs` every 2s while auto-refresh is on; auto-scroll on. Tauri Channel streaming still planned for Phase 4 |
| Log filtering / search          | PLANNED |                                                                                                                                        |
| Log tabs per service            | PLANNED | MariaDB, Apache, PHP tabs                                                                                                              |
| Log auto-scroll toggle          | PLANNED |                                                                                                                                        |

---

## PHP Version Management

| Feature                       | Status  | Notes                                                                                                                                                               |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List PHP versions (installed) | DONE    | `get_php_versions` scans `php/` dir                                                                                                                                 |
| PHP version selector UI       | DONE    | `php-version-selector.tsx`                                                                                                                                          |
| Switch PHP version            | DONE    | Creates `php/current` junction (Windows)                                                                                                                            |
| Download PHP version          | DONE    | `download_php_version` streams the real zip from windows.php.net, extracts to `php/{branch}/`, writes a default `php.ini`, and emits `php-download-progress` events |
| PHP Extension management      | PLANNED | Enable/disable extensions in php.ini                                                                                                                                |

---

## Database Management

| Feature                       | Status  | Notes                                   |
| ----------------------------- | ------- | --------------------------------------- |
| phpMyAdmin integration        | DONE    | Served via Apache at `/phpmyadmin`      |
| MariaDB database backup (all) | DONE    | `backup_mysql_database` using mysqldump |
| MariaDB user management UI    | PLANNED |                                         |
| Database-specific backup      | PLANNED | Backup individual databases             |
| Database restore              | PLANNED | Import .sql file                        |

---

## Navigation & UI Shell

| Feature                  | Status  | Notes                                      |
| ------------------------ | ------- | ------------------------------------------ |
| Sidebar navigation       | DONE    | `sidebar.tsx`                              |
| Command palette (Ctrl+P) | DONE    | `command-palette.tsx`                      |
| Top bar with actions     | DONE    | In `App.tsx` header                        |
| Context menus            | PLANNED | shadcn/ui ContextMenu for per-item actions |
| Breadcrumb navigation    | PLANNED |                                            |
| Window controls (custom) | DONE    | `WindowControls.tsx`                       |

---

## System Tray

| Feature                     | Status  | Notes                                                                                                |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Tray icon appears           | DONE    | Tauri tray-icon plugin                                                                               |
| Minimize to tray            | PARTIAL | Basic minimize works                                                                                 |
| Tray context menu           | PARTIAL | Basic menu configured in `lib.rs`                                                                    |
| Tray click opens app        | PARTIAL |                                                                                                      |
| Tray service status display | DONE    | `set_tray_tooltip` updated every 5s by `ServiceManager` with Apache/MySQL/PHP state                  |
| Tray service start/stop     | DONE    | Tray menu emits `tray-toggle-service`; `ServiceManager` routes to the same toggle pipeline as the UI |
| Notifications from tray     | PLANNED | Service start/stop notifications                                                                     |

---

## Auto-Update

| Feature                         | Status  | Notes                                    |
| ------------------------------- | ------- | ---------------------------------------- |
| Tauri updater plugin configured | DONE    | `tauri-plugin-updater` in Cargo.toml     |
| Update check on startup         | PARTIAL | `auto-updater.tsx` component exists      |
| Install update prompt           | PARTIAL | UI exists, flow not fully tested         |
| Update from GitHub Releases     | PLANNED | Needs `tauri.conf.json` updater endpoint |

---

## Developer Terminal

| Feature                         | Status  | Notes                             |
| ------------------------------- | ------- | --------------------------------- |
| Open PHP terminal (Windows cmd) | DONE    | `open_php_terminal` opens cmd.exe |
| Embedded xterm.js terminal      | PLANNED | Full terminal in-app              |
| MariaDB CLI in terminal         | PLANNED |                                   |
| Composer CLI in terminal        | PLANNED |                                   |

---

## One-Click App Installers

| Feature                 | Status  | Notes |
| ----------------------- | ------- | ----- |
| WordPress installer     | PLANNED |       |
| Laravel installer       | PLANNED |       |
| Project template system | PLANNED |       |

---

## Security & Analyzer

| Feature                         | Status  | Notes                  |
| ------------------------------- | ------- | ---------------------- |
| Bug reporting via GitHub Issues | PLANNED | Pre-filled issue modal |
| Security config analyzer        | PLANNED |                        |
| HTTPS / SSL for local sites     | PLANNED |                        |

---

## Planned Future Features (Not Scheduled)

- Mail testing (Mailhog)
- Portable mode
- Virtual host management (`.test` domains)
- Bundled tools (curl, git, node, npm)
- Full backup/restore (www + databases + configs)

---

## Version History Summary

| Version         | Key Changes                                                            |
| --------------- | ---------------------------------------------------------------------- |
| v0.1.6          | MSI fixed, CSS restored, GitHub Actions fixed, both installers working |
| v0.1.5          | Build system improvements                                              |
| v0.1.0 - v0.1.4 | Early alpha, architecture setup                                        |
