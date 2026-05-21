# DevStackBox - Architecture Overview

**Version**: v0.1.6  
**Last Updated**: May 2026  
**Single Source of Truth**: This file describes how all parts of DevStackBox connect. Update this file whenever you change the architecture.

---

## Tech Stack at a Glance

| Layer            | Technology                             | Purpose                                          |
| ---------------- | -------------------------------------- | ------------------------------------------------ |
| Frontend UI      | React 18 + Vite                        | All visible UI                                   |
| Styling          | Tailwind CSS + shadcn/ui               | All styles - NO custom CSS                       |
| Animation        | Framer Motion                          | All transitions/animations                       |
| i18n             | i18next                                | EN and HI translations                           |
| Backend          | Tauri 2 (Rust)                         | Process management, file I/O, native OS ops      |
| IPC Bridge       | Tauri Commands + Events                | Frontend <-> Backend communication               |
| Service binaries | httpd.exe, mysqld.exe (MySQL), php.exe | The actual servers (always bundled in installer) |

---

## Directory Map (What Lives Where)

```text
DevStackBox/
|
|-- src/                        # FRONTEND (React + Vite)
|   |-- App.tsx                 # Root component. Routing, layout, top-level state
|   |-- main.tsx                # React entry point (do not touch)
|   |-- globals.css             # Tailwind base imports only (do not add custom CSS here)
|   |
|   |-- pages/
|   |   |-- dashboard.tsx       # Dashboard page - service overview
|   |   |-- services.tsx        # Services page - start/stop controls + logs
|   |   |-- SystemTrayPage.tsx  # System tray config page
|   |   |-- index.ts            # Re-exports pages currently used by App.tsx
|   |
|   |-- components/
|   |   |-- ui/                 # shadcn/ui base components (DO NOT MODIFY)
|   |   |-- services/           # Service-specific components
|   |   |   |-- service-manager.tsx    # Polls status, handles start/stop for all services
|   |   |   |-- service-card.tsx       # UI card for a single service
|   |   |   |-- service-actions.tsx    # Buttons: Start, Stop, Open Browser
|   |   |   |-- status-badge.tsx       # Running/Stopped badge
|   |   |   |-- log-viewer.tsx         # Log display component
|   |   |   |-- mysql-service.tsx      # MySQL-specific UI
|   |   |   |-- apache-service.tsx     # Apache-specific UI
|   |   |   |-- php-service.tsx        # PHP-specific UI
|   |   |   |-- index.ts               # Re-exports all service components
|   |   |
|   |   |-- sidebar.tsx             # Main navigation sidebar
|   |   |-- command-palette.tsx     # Ctrl+P command palette
|   |   |-- config-editor.tsx       # Config file editor
|   |   |-- auto-updater.tsx        # Auto-update UI
|   |   |-- language-switcher.tsx   # EN/HI switcher
|   |   |-- theme-toggle.tsx        # Dark/Light toggle
|   |   |-- theme-provider.tsx      # Theme context wrapper
|   |   |-- php-version-selector.tsx # PHP version picker modal
|   |   |-- DebugPanel.tsx          # Development debug panel
|   |   |-- WindowControls.tsx      # Custom window buttons
|   |   |-- SystemTrayButton.tsx    # Tray minimize button
|   |   |-- SystemTrayStatus.tsx    # Tray status indicator
|   |   |-- system-tray/            # System tray re-export helpers and notes
|   |
|   |-- hooks/
|   |   |-- use-toast.ts            # Toast notification hook
|   |   |-- useSystemTray.ts        # System tray state hook
|   |
|   |-- lib/
|   |   |-- tauri.ts                # isTauri(), safeInvoke(), mock data helpers
|   |   |-- i18n.ts                 # i18next setup
|   |   |-- utils.ts                # cn() class merge helper (shadcn)
|   |   |-- version.ts              # APP_VERSION constant
|   |   |-- commands.ts             # TAURI_COMMANDS map (command name strings)
|   |
|   |-- types/
|       |-- services.ts             # Shared TypeScript types (ServiceStatus, ServiceName, etc.)
|
|-- src-tauri/                  # BACKEND (Rust + Tauri)
|   |-- src/
|   |   |-- main.rs             # Binary entry point (do not touch)
|   |   |-- lib.rs              # ALL Tauri commands live here (~1600 lines)
|   |   |-- service_manager.rs  # DEAD CODE - unused, do not use
|   |
|   |-- tauri.conf.json         # App config: window size, bundle targets, resources
|   |-- Cargo.toml              # Rust dependencies
|   |-- build.rs                # Build script
|   |-- capabilities/           # Tauri permission definitions
|   |-- icons/                  # App icons
|   |-- wix/                    # MSI installer customization
|
|-- config/                     # Service config files (runtime, not source)
|   |-- my.cnf                  # MySQL config
|   |-- httpd.conf              # Apache config
|   |-- phpmyadmin.conf         # phpMyAdmin Apache config
|
|-- locales/
|   |-- en.json                 # English translations
|   |-- hi.json                 # Hindi translations
|
|-- mysql/                      # MySQL binaries + data (bundled with app)
|-- apache/                     # Apache binaries (bundled with app)
|-- php/8.3/                    # PHP 8.3 binaries (bundled with app)
|-- phpmyadmin/                 # phpMyAdmin PHP files (bundled with app)
|-- www/                        # Web root - user's PHP projects go here
|-- logs/                       # Runtime log files
|-- config-backups/             # Automatic config backups
|-- docs/                       # THIS FOLDER - All project documentation
```

---

## UI Layout

DevStackBox uses a fixed two-panel desktop app layout. Do not redesign this.

```text
┌───────────────────┬──────────────────────────────────────┐
│  Top Bar          │  Top Bar (continued)                 │
│  DevStackBox      │  [Version] [Updates] [Lang] [Theme]  │
├───────────────────┼──────────────────────────────────────┤
│                   │                                      │
│  Sidebar          │  Main Content Area                   │
│  (220-260px)      │                                      │
│                   │  Current Page:                       │
│  Dashboard        │  Service cards / logs / settings     │
│  Services         │  Config editor / PHP versions        │
│  Projects         │                                      │
│  Logs             │  Clean, spacious, card-based.        │
│  Settings         │                                      │
│  About            │  NO crowded tables.                  │
│                   │                                      │
└───────────────────┴──────────────────────────────────────┘
```

**Top Bar currently contains:**

- App title
- Version badge
- Auto updater entry point
- Language switcher
- Theme toggle (dark/light)

**Current shortcut-driven controls:**

- Command palette opens with `Ctrl+P`
- Tray controls exist in dedicated components and hooks, but are not mounted in the current top bar

**Sidebar currently contains these 6 items:**
`Dashboard` / `Services` / `Projects` / `Logs` / `Settings` / `About`

**Availability today:**

- `Dashboard`, `Services`, `Settings`, and `About` are active
- `Projects` and `Logs` are present as placeholders and intentionally disabled in the sidebar

Do not overload the sidebar with sub-items or collapsible trees.

**Dashboard page structure:**

```text
Dashboard
├── Quick Actions (Start All / Stop All / Restart Apache)
├── Service Status Cards (Apache / PHP / MySQL)
├── Current PHP Version
├── Ports Overview
├── Recent Logs (last 10 lines)
└── Project Shortcuts (www/ folder links)
```

**Service card structure (each card):**

```text
[ Apache ]       Running ●
Port: 80   PID: 1234
[ Start ]  [ Stop ]  [ Logs ]  [ Config ]
```

**Progressive Disclosure Rule:**  
Default view shows: start / stop / running status only.  
Expanded view shows: logs, config, ports, PID, arguments.  
This keeps the UI approachable for beginners, powerful for advanced users.

**Design Philosophy:**  
DevStackBox should feel like a native desktop utility (like Docker Desktop or GitHub Desktop), NOT like a web admin panel, analytics dashboard, or cPanel.

## Reuse and Consistency Rules

These rules are architectural, not optional style preferences.

1. Reuse existing shared components before creating new ones. Start with `ServiceCard`, `ServiceActions`, `StatusBadge`, `LogViewer`, `ConfigEditor`, and existing shadcn/ui primitives.
2. Keep business logic in one owner. Polling stays in `service-manager.tsx`; command strings stay in `src/lib/commands.ts`; shared types stay in `src/types/services.ts`.
3. Prefer composition over cloning. If two screens need the same card, toolbar, or dialog shell, add props or children to the shared component instead of copying markup.
4. Keep visual language consistent. The same action should use the same component, label pattern, spacing scale, and variant wherever it appears.
5. If a new reusable pattern is introduced, document it in `docs/COMPONENTS.md` immediately so future work can extend it instead of recreating it.

---

## App/Data Directory Separation

This is critical for reliable auto-updates. Violating this causes update-related data loss.

### Two separate roots — NEVER mix them

**App Root (replaceable during updates):**

```text
C:\Program Files\DevStackBox\     (or C:\DevStackBox\ for portable)
  DevStackBox.exe
  apache/        <- Apache binaries
  php/           <- PHP binaries
  phpmyadmin/    <- phpMyAdmin PHP files
  resources/
```

**User Data Root (NEVER touched during updates):**

```text
C:\dsb-data\                      (or %APPDATA%\DevStackBox\ for installed mode)
  www/           <- User's PHP projects
  mysql-data/    <- MySQL database files
  logs/          <- All service logs
  config/        <- Runtime configs (php.ini, httpd.conf, my.cnf)
  config-backups/
  certs/
  backups/
```

**Rule:** MySQL database files (`mysql/data/`) must NEVER live inside the app folder. A database inside the app folder will be destroyed or corrupted on update.

**Current state (v0.1.6):** This separation does not exist yet. Everything is in one directory. Fixing this is Phase 1.8 (see ROADMAP.md).

**Config versioning:** All config files should contain a version field:

```json
{ "configVersion": 1 }
```

This allows migration scripts to transform old config formats when the app updates.

---

## How Frontend Talks to Rust (IPC Pattern)

Every call from React to Rust goes through `src/lib/tauri.ts:safeInvoke()`.

```text
React Component
  --> safeInvoke("command_name", { param: value })   [src/lib/tauri.ts]
      --> Tauri invoke()                             [Tauri IPC bridge]
          --> #[tauri::command] fn command_name()   [src-tauri/src/lib.rs]
              --> Result<T, String>                 [returned to frontend]
```

**Rules:**

- Always use `safeInvoke` (not raw `invoke`) so it works in browser dev mode too
- Shared command names live in `src/lib/commands.ts:TAURI_COMMANDS`; expand that file instead of creating new scattered constants
- Current gap: some older components still hardcode command strings and should be migrated into `TAURI_COMMANDS`
- All commands are in `src-tauri/src/lib.rs` - do NOT use `service_manager.rs`
- Commands return `Result<T, String>` - errors are caught in the component

---

## How Rust Talks Back to Frontend (Events)

For real-time data (log streaming, service status changes), Rust uses Tauri events:

```text
Rust (lib.rs)
  --> app_handle.emit("event-name", payload)
      --> Frontend listener
          --> listen("event-name", callback)         [Tauri event API]
```

Currently this pattern is NOT yet used - all status is fetched by polling from the frontend. This is a known issue (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md)).

---

## Service Path Resolution

This is a critical and error-prone area. The function `get_installation_path()` in `lib.rs` determines where MySQL, Apache, and PHP binaries live. It checks in this order:

1. `current_dir` if it contains `apache/bin/httpd.exe`
2. `exe_parent` (installed app location)
3. `exe_grandparent`
4. Hardcoded fallbacks: `C:\xampp\htdocs\DevStackBox`, `C:\dsb`, `C:\Program Files\DevStackBox`, `C:\DevStackBox`
5. `current_dir` as final fallback

**In development:** The app runs from `src-tauri/`, so paths resolve to `c:\xampp\htdocs\DevStackBox\`  
**In production (installed):** The app resolves relative to the installer output directory

**Rule:** Never hardcode paths in the frontend. Always let the Rust backend resolve paths.

---

## State Management

There is no global state manager (no Redux, Zustand, etc.). State is managed:

- **Local component state**: `useState` in each page/component
- **Service status polling**: `ServiceManager` component polls every 5 seconds via `safeInvoke`
- **Theme**: React context via `ThemeProvider`
- **Rust-side state**: Two global `LazyLock<Mutex<HashMap>>` in `lib.rs`:
  - `SERVICE_STATUS` - tracks running/stopped state
  - `SERVICE_PROCESSES` - tracks PIDs

**Rule:** Do not add a global state manager unless shared state between 3+ unrelated components becomes unmanageable.

---

## Build Pipeline

```text
pnpm tauri:build
  --> npm run build (tsc && vite build)  --> dist/
  --> cargo build --release              --> src-tauri/target/release/
  --> tauri bundle                       --> MSI + NSIS installers
```

Resources bundled into the installer are declared in `tauri.conf.json`:

```json
"resources": ["../mysql/**/*", "../php/**/*", "../phpmyadmin/**/*", "../www/**/*", "../config/**/*"]
```

---

## Adding a New Feature: Checklist

1. **Rust backend command** (if needed): Add `#[tauri::command] async fn my_command()` to `lib.rs`, and add it to `invoke_handler` in `run()` at the bottom of `lib.rs`.
2. **Frontend constant**: Add the command name to `TAURI_COMMANDS` in `src/lib/commands.ts`.
3. **TypeScript types**: Add any new types to `src/types/services.ts`.
4. **React component**: Create component in appropriate folder. Style with Tailwind + shadcn/ui only.
5. **Translation keys**: Add EN and HI strings to `locales/en.json` and `locales/hi.json`.
6. **Update this doc**: Update ARCHITECTURE.md and FEATURE_STATUS.md.

---

## Key Design Decisions

| Decision                                | Reason                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| All Tauri commands in one `lib.rs`      | Simpler to maintain; `service_manager.rs` is legacy dead code                   |
| `safeInvoke` wrapper                    | Allows frontend to run in browser during development                            |
| No custom CSS                           | Tailwind + shadcn/ui covers all needs; custom CSS causes theming bugs           |
| Polling for service status              | Simpler than event streams; events are planned for future                       |
| `config/` dir for runtime configs       | Keeps source and runtime config separate                                        |
| `config-backups/` auto-backup           | Auto-backup before every config save prevents data loss                         |
| Two-panel layout (sidebar + main)       | Standard desktop utility pattern; do not redesign                               |
| Progressive disclosure in service UI    | Beginners see start/stop; experts expand for logs, config, PID                  |
| App/data directory separation (planned) | Required for safe auto-updates; see docs/UPDATES_AND_MIGRATIONS.md              |
| Installed mode only (no portable in v1) | Portable mode cannot support auto-updates reliably; adds architectural conflict |
