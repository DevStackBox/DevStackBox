# DevStackBox - Architecture Overview

**Version**: v0.1.6  
**Last Updated**: May 2026  
**Single Source of Truth**: This file describes how all parts of DevStackBox connect. Update this file whenever you change the architecture.

---

## Tech Stack at a Glance

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend UI | React 18 + Vite | All visible UI |
| Styling | Tailwind CSS + shadcn/ui | All styles - NO custom CSS |
| Animation | Framer Motion | All transitions/animations |
| i18n | i18next | EN and HI translations |
| Backend | Tauri 2 (Rust) | Process management, file I/O, native OS ops |
| IPC Bridge | Tauri Commands + Events | Frontend <-> Backend communication |
| Service binaries | mysqld.exe, httpd.exe, php.exe | The actual servers |

---

## Directory Map (What Lives Where)

```
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
|   |   |-- index.ts            # Re-exports all pages
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
|   |   |-- constants.ts            # TAURI_COMMANDS map (command name strings)
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
|-- php/8.2/                    # PHP 8.2 binaries (bundled with app)
|-- phpmyadmin/                 # phpMyAdmin PHP files (bundled with app)
|-- www/                        # Web root - user's PHP projects go here
|-- logs/                       # Runtime log files
|-- config-backups/             # Automatic config backups
|-- docs/                       # THIS FOLDER - All project documentation
```

---

## How Frontend Talks to Rust (IPC Pattern)

Every call from React to Rust goes through `src/lib/tauri.ts:safeInvoke()`.

```
React Component
  --> safeInvoke("command_name", { param: value })   [src/lib/tauri.ts]
      --> Tauri invoke()                             [Tauri IPC bridge]
          --> #[tauri::command] fn command_name()   [src-tauri/src/lib.rs]
              --> Result<T, String>                 [returned to frontend]
```

**Rules:**
- Always use `safeInvoke` (not raw `invoke`) so it works in browser dev mode too
- All command names live in `src/lib/constants.ts:TAURI_COMMANDS` - never hardcode strings
- All commands are in `src-tauri/src/lib.rs` - do NOT use `service_manager.rs`
- Commands return `Result<T, String>` - errors are caught in the component

---

## How Rust Talks Back to Frontend (Events)

For real-time data (log streaming, service status changes), Rust uses Tauri events:

```
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

```
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
2. **Frontend constant**: Add the command name to `TAURI_COMMANDS` in `src/lib/constants.ts`.
3. **TypeScript types**: Add any new types to `src/types/services.ts`.
4. **React component**: Create component in appropriate folder. Style with Tailwind + shadcn/ui only.
5. **Translation keys**: Add EN and HI strings to `locales/en.json` and `locales/hi.json`.
6. **Update this doc**: Update ARCHITECTURE.md and FEATURE_STATUS.md.

---

## Key Design Decisions

| Decision | Reason |
|---------|--------|
| All Tauri commands in one `lib.rs` | Simpler to maintain; `service_manager.rs` is legacy dead code |
| `safeInvoke` wrapper | Allows frontend to run in browser during development |
| No custom CSS | Tailwind + shadcn/ui covers all needs; custom CSS causes theming bugs |
| Polling for service status | Simpler than event streams; events are planned for future |
| `config/` dir for runtime configs | Keeps source and runtime config separate |
| `config-backups/` auto-backup | Auto-backup before every config save prevents data loss |
