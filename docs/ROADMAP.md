# DevStackBox - Official Roadmap

**The single source of truth for what we are building and in what order.**  
Feature requests and discussions: [GitHub Discussions](https://github.com/ProgrammerNomad/DevStackBox/discussions)

---

## Product Vision

DevStackBox will become the **best modern PHP local development stack for Windows**.

It is NOT a universal developer infrastructure platform. Scope is intentionally limited.

**Core Stack (always bundled in installer):**

- Apache HTTP Server
- PHP 8.2 (one version bundled today; additional versions are downloadable later)
- MariaDB (MySQL-compatible; command names and binary use `mysql`/`mysqld` by convention)
- phpMyAdmin

No Docker, no Redis, no PostgreSQL, no Node runtime manager — not in v1.

**Installer Philosophy:**

> Install → Start → Works immediately.

The installer must produce a fully functional PHP development environment without any post-install downloads. A user in India on a slow connection must be able to install once, unplug from the internet, and have a working `localhost` stack.

Do NOT require users to download core components on first launch. Bad first-launch experiences drive users away permanently.

**What is bundled vs downloadable:**

| Component           | Strategy      | Notes                                                            |
| ------------------- | ------------- | ---------------------------------------------------------------- |
| Apache              | Bundled       | Core requirement, no internet needed                             |
| PHP 8.2             | Bundled       | Current default version, works immediately                       |
| MariaDB             | Bundled       | Database server (commands/binary use mysql naming by convention) |
| phpMyAdmin          | Bundled       | Developers expect it, keep it bundled                            |
| Default configs     | Bundled       | Required for first launch                                        |
| Sample `www/` page  | Bundled       | Confirms stack works immediately                                 |
| PHP 8.1 / 8.3 / 8.4 | Downloadable  | Optional future versions on demand via PHP Versions UI           |
| Node.js support     | Future module | Not in v1                                                        |
| Redis               | Future module | Not in v1                                                        |
| PostgreSQL          | Future module | Not in v1                                                        |

**Target installer size:** 250–500 MB is acceptable. Do not sacrifice reliability or UX to reduce installer size.

---

## Current State: v0.1.6

The project has strong architecture and documentation but is in the "dangerous middle stage" — features exist but stability is incomplete. The next phase is stabilization, not new features.

---

## Phase 1 — Core Stability (Current Priority)

**Goal:** Make what exists actually work reliably. Fix nothing is broken silently.  
**Do NOT start Phase 2 until all Phase 1 items are done.**

### 1.1 Remove Dead Code

- [x] Delete `src-tauri/src/service_manager.rs` (192 lines, never called)
- [x] Remove commented-out `mod service_manager;` from `lib.rs`

### 1.2 Fix Rust Warnings

- [x] Run `cargo clippy --fix` in `src-tauri/`
- [x] Fix remaining `dead_code` warnings manually
- [x] Build should be warning-free before Phase 2 begins (verified: `cargo check` and `cargo clippy --all-targets -- -D warnings` both clean)

### 1.3 Fix Service Status Logic (Critical)

- [x] Remove `SERVICE_STATUS` global HashMap (and `SERVICE_PROCESSES`)
- [x] All status queries use ONLY `is_process_running()` (OS process check)
- [x] No two sources of truth for service state

### 1.4 Fix Path Resolution

- [x] Remove `C:\xampp\htdocs\DevStackBox` from production fallback paths
- [x] Production fallbacks: `C:\dsb`, `C:\Program Files\DevStackBox`, `C:\DevStackBox`
- [ ] Add path resolution test via `debug_installation` command

### 1.5 Fix `switch_php_version`

- [x] Replace `Command::new("mklink")` with `Command::new("cmd").args(["/C", "mklink", "/J", ...])`
- [ ] Test junction creation on fresh Windows install (manual QA)
- [x] Handle "requires admin" case with proper error message

### 1.6 Standardize Command Constants

- [x] Audit ALL `safeInvoke()` and `invoke()` calls across frontend
- [x] Move every hardcoded command string into `TAURI_COMMANDS` in `src/lib/commands.ts`
- [x] Zero hardcoded strings in component files

### 1.7 Fix DebugPanel in Production

- [x] Wrap `DebugPanel` in `{import.meta.env.DEV && <DebugPanel />}` (implemented as internal `if (!import.meta.env.DEV) return null;` guard so it can never render in release)
- [x] Debug info must never be visible in release builds

### 1.8 App/Data Directory Separation (Required Before Auto-Update)

This is a prerequisite for enabling auto-updates. Without it, updates will destroy user data.

- [x] Define User Data Root path: `%LOCALAPPDATA%\DevStackBox\` (override via `DEVSTACKBOX_DATA_DIR` env var)
- [x] Move MySQL `data/` directory out of `mysql/` and into User Data Root (`<root>/mysql-data/`)
- [x] Move `www/` to User Data Root
- [x] Move `logs/` to User Data Root
- [x] Move runtime `config/` to User Data Root (default configs are now generated into `<root>/config/` on first run; source `config/` in repo is dev-only)
- [x] Update `get_installation_path()` and add `get_user_data_root()` to `lib.rs`
- [ ] Add `configVersion: 1` to all config files written by the app (deferred to migrations work)
- [x] Update all hardcoded path assumptions in `lib.rs`
- [ ] Test: app works correctly after separation on a clean Windows install (manual QA)

**Implemented layout (Phase 1.8):**

```
%LOCALAPPDATA%\DevStackBox\
  config\           my.cnf, httpd.conf, phpmyadmin.conf
  config-backups\   timestamped .bak files
  logs\             error.log, access.log, mysql.log, php_error.log, httpd.pid
  mysql-data\       MySQL data directory (initialized on first start)
  www\              web document root (index.html, etc.)
  backups\          mysql dumps and other app backups
```

Binaries (Apache, PHP, MySQL, phpMyAdmin) remain inside the install dir and may be replaced by auto-update without touching user data.

See `docs/UPDATES_AND_MIGRATIONS.md` for the full architecture.

---

## Phase 2 — Modularize Backend [DONE]

**Goal:** Split `lib.rs` (~1600 lines) into maintainable modules.  
Do this as a dedicated refactor task. Do NOT mix with feature work.

**Status:** Completed. `lib.rs` reduced from ~1900 lines to ~150 lines (module declarations + `run()` + tray setup). All commands extracted to `commands/{mysql,apache,php,config,logs,system,tray}.rs`. Path and process helpers extracted to `utils/{paths,process}.rs`. Shared types in `types.rs`. Default HTML/PHP templates moved out of Rust strings into `templates/default_*.{html,php}` and pulled in via `include_str!`. `cargo check`, `cargo clippy --all-targets -- -D warnings`, and `npx tsc --noEmit` all clean.

### Target structure

```text
src-tauri/src/
  lib.rs                 (run() + module declarations only)
  commands/
    mysql.rs             (start_mysql, stop_mysql, get_mysql_status, backup_mysql_database)
    apache.rs            (start_apache, stop_apache, get_apache_status, test_apache_config)
    php.rs               (get_php_status, toggle_php, switch_php_version, download_php_version)
    config.rs            (read_config, write_config, backup_config, restore_config, list_backups)
    logs.rs              (get_service_logs, stream_logs)
    system.rs            (check_binaries, debug_installation, debug_paths, open_in_browser)
  utils/
    paths.rs             (get_installation_path, get_user_data_path, find_binary)
    process.rs           (is_process_running, get_process_pid, kill_process)
```

---

## Phase 3 — Make It Actually Usable

**Goal:** Core features work end-to-end without workarounds.

### 3.1 Additional PHP Version Downloader

**Note:** Base PHP 8.2 is bundled today. This feature adds support for downloading additional PHP versions (8.1, 8.3, 8.4, etc.) on demand. It does not replace the bundled PHP unless the product decision changes later.

- [ ] Download PHP zip from `windows.php.net` using Tauri HTTP plugin
- [ ] Extract to `php/{version}/`
- [ ] Generate `php.ini` with sensible defaults
- [ ] Verify `php.exe` works after extraction
- [ ] Emit progress events to frontend (Tauri Channel)
- [ ] Show real progress bar in `PHPVersionSelector`
- [ ] Graceful error handling for: no internet, antivirus block, slow connection

### 3.2 Real-Time Log Streaming

- [ ] Start with: poll `get_service_logs` every 2 seconds from frontend
- [ ] Auto-scroll to bottom on new lines
- [ ] Filter/search on the frontend without re-fetching
- [ ] Later (Phase 4): replace polling with Tauri Channel streaming

### 3.3 Virtual Hosts (Local Domains)

- [ ] Add/remove vhosts via UI (`myapp.local`, `shop.local`)
- [ ] Auto-edit `apache/conf/extra/httpd-vhosts.conf`
- [ ] Edit Windows `hosts` file (requires elevation prompt)
- [ ] Show all active virtual hosts on dashboard

### 3.4 Process Supervision (Crash Recovery)

- [ ] Detect when Apache or MySQL crashes (poll `is_process_running` every 5s)
- [ ] Show crash notification in UI
- [ ] Offer one-click restart
- [ ] Log crash event with timestamp

---

## Phase 4 — Installer & Distribution

**Goal:** Reliable installation on real user machines.

### 4.1 MSI Reliability and Bundled Stack Verification

- [ ] Verify MariaDB binaries are in place and correctly configured in installer bundle
- [ ] Verify bundled stack installs and starts correctly: Apache + PHP 8.2 + MariaDB + phpMyAdmin
- [ ] Test installation path options (`C:\dsb`, `C:\Program Files\DevStackBox`)
- [ ] Verify all binaries are in expected paths after MSI install
- [ ] Test clean install and upgrade install
- [ ] Test first-launch experience: shows all services ready, no internet required
- [ ] Document known conflicts (IIS, other XAMPP installs)

### 4.2 64-bit Apache Bundle

- [ ] Replace any 32-bit Apache binaries with ApacheLounge 64-bit (VC17)
- [ ] Document the Apache source and build in `docs/APACHE_64BIT_GUIDE.md`
- [ ] Test DLL dependencies on clean Windows 11

### 4.3 Auto-Updater

**Prerequisites — do not start this until ALL are complete:**

- Phase 1.8 (App/Data directory separation) is done
- `get_installation_path()` returns deterministic, stable paths
- MySQL `data/` is in User Data Root, not App Root
- Config versioning (`configVersion` field) is in place

**Implementation tasks:**

- [ ] Configure updater endpoint in `tauri.conf.json` (GitHub Releases JSON URL)
- [ ] Generate signing key pair and store private key in GitHub Secrets
- [ ] Implement pre-update service shutdown (stop Apache + MySQL cleanly before update)
- [ ] Implement backup-before-update (copy current configs to config-backups/)
- [ ] Implement config migration runner (reads configVersion, applies migrations)
- [ ] Test update flow: install v0.X.Y, update to v0.X.Y+1, verify user data intact
- [ ] Document full release + signing flow in `docs/RELEASE_PROCESS.md`

See `docs/UPDATES_AND_MIGRATIONS.md` for the full architecture and checklist.

### 4.4 Code Signing

- [ ] Research signing options (Azure Code Signing, EV cert, self-signed)
- [ ] Document the decision in `docs/adr/006-code-signing.md`
- [ ] Implement if Windows Defender SmartScreen is blocking the installer

---

## Phase 5 — Developer Experience Polish

**Goal:** Make DevStackBox noticeably better than XAMPP/WAMP for daily use.

### 5.1 HTTPS Localhost

- [ ] Auto-generate local certificate for `localhost`
- [ ] Trust certificate in Windows certificate store (requires elevation)
- [ ] Extend to virtual host domains

### 5.2 PHP Error Visibility

- [ ] Surface Apache error log entries in the main UI
- [ ] Show PHP fatal errors with file/line
- [ ] Port conflict detection before Apache starts

### 5.3 Tray Polish

- [ ] Show service status in tray tooltip
- [ ] Quick start/stop from tray menu without opening main window
- [ ] Startup-on-login option

### 5.4 System Tray & Startup

- [ ] Option to launch on Windows startup
- [ ] Option to minimize to tray on window close

---

## What We Will NOT Build (in v1)

These are explicitly out of scope for the current product:

- Docker / container management
- Plugin marketplace
- Cloud sync
- Mobile development tools
- Nginx (Apache only for now)

**The following are deferred to future optional modules (not in v1, but not never):**

- Redis (future optional module)
- PostgreSQL (future optional module)
- Node.js runtime manager (future optional module)
- Python / Ruby runtimes (future optional module)

**Rationale:** These would fragment effort and dilute the core PHP stack focus. The goal is to be the best PHP stack first. Modular extensions can be added after v1.0 is stable and trusted.

---

## MariaDB (Decided)

DevStackBox uses **MariaDB** as its database server.

**Why MariaDB:**

- No Oracle EULA complexity — redistribution is cleaner
- Lighter binaries
- Fully MySQL-compatible — no app code changes needed
- Used by most modern PHP stacks (Laravel Sail, DDEV, Herd)
- Same `mysqld.exe` binary interface — Tauri command names remain `start_mysql`, `stop_mysql` etc. by convention

Users will not notice the difference. phpMyAdmin, Laravel, WordPress, and all common PHP tools work identically with MariaDB.

---

## Version Milestones

| Version | Goal                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| v0.1.6  | Current — architecture and docs complete, builds work                                      |
| v0.2.0  | Phase 1 + 2 — stable backend, no dead code, app/data dirs separated, zero Rust warnings    |
| v0.3.0  | Phase 3 — additional PHP downloader, real-time logs, virtual hosts, crash recovery         |
| v0.4.0  | Phase 4 — MSI reliability, code signing, safe auto-update enabled                          |
| v1.0.0  | Phase 5 — HTTPS localhost, tray polish, startup-on-login, first-launch onboarding complete |
