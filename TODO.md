# DevStackBox TODO

## Phase 1 - React Router + Core Routing Refactor

_All other phases depend on this._

- [ ] Add `react-router-dom` dependency (`pnpm add react-router-dom`)
- [ ] Wrap `src/App.tsx` root in `<HashRouter>`, replace `currentPage` state + `renderPage()` switch with `<Routes>/<Route>` declarations
- [ ] Keep non-routing global state in App.tsx (`sidebarCollapsed`, `commandPaletteOpen`, `configEditorOpen`, etc.)
- [ ] Migrate `src/components/sidebar.tsx` onClick navigation to `<NavLink>`
- [ ] Migrate `src/components/breadcrumb.tsx` to `useLocation` + `useMatches` for dynamic breadcrumb trail
- [ ] Migrate `src/components/command-palette.tsx` `onPageChange` prop to `useNavigate()`
- [ ] Migrate `src/pages/dashboard.tsx` internal navigation calls to `useNavigate()`
- [ ] Migrate `src/pages/services.tsx` internal navigation calls to `useNavigate()`
- [ ] Define route metadata object (path, title, icon) for every route - single source of truth used by breadcrumbs, command palette, page titles, and future navigation search

## Phase 2 - Sidebar Trim to 8 Items

_Parallel with Phase 1._

- [ ] Remove `mysql-users`, `ssl`, `vhosts`, `backup`, `projects` from `menuItems` array in `src/components/sidebar.tsx`
- [ ] Keep exactly: Dashboard, Services, Databases, Logs, Terminal, Security, Settings, About
- [ ] Add sub-navigation translation keys to `locales/en.json` and `locales/hi.json`

## Phase 3 - Service Workspace Pages

_Depends on Phase 1._

- [ ] Create `src/components/service-workspace-layout.tsx` - shared sticky sub-nav (NavLink-based, tab-styled) + `<Outlet />`
- [ ] Create `src/components/service-workspace-header.tsx` - reusable workspace header (icon, title, status badge, top-level actions) shared across Apache, MySQL, PHP, Databases, and Settings workspaces

Apache workspace (`/services/apache/*`):

- [ ] `src/pages/services/apache/layout.tsx` - tabs: Overview, Logs, Config, Virtual Hosts, SSL
- [ ] `src/pages/services/apache/index.tsx` - service status, start/stop, uptime, phpMyAdmin link
- [ ] `src/pages/services/apache/logs.tsx` - reuse `LogViewer` with service="apache"
- [ ] `src/pages/services/apache/config.tsx` - `ConfigEditor` logic for httpd.conf
- [ ] `src/pages/services/apache/vhosts.tsx` - content moved from `src/pages/vhosts.tsx`
- [ ] `src/pages/services/apache/ssl.tsx` - content moved from `src/pages/ssl.tsx`

MySQL workspace (`/services/mysql/*`):

- [ ] `src/pages/services/mysql/layout.tsx` - tabs: Overview, Logs (service-focused; database management lives in the top-level Databases workspace)
- [ ] `src/pages/services/mysql/index.tsx` - status, start/stop, uptime, memory

PHP workspace (`/services/php/*`):

- [ ] `src/pages/services/php/layout.tsx` - tabs: Overview, Extensions, Config
- [ ] `src/pages/services/php/index.tsx` - version badge, switcher CTA, "Ready"/"Installed" status (not "Running")
- [ ] `src/pages/services/php/extensions.tsx` - PHP extensions list
- [ ] `src/pages/services/php/config.tsx` - php.ini editor

Databases workspace (`/databases/*`):

- [ ] `src/pages/databases/layout.tsx` - tabs: Databases, Users, Backups
- [ ] `src/pages/databases/index.tsx` - databases list (current `databases.tsx` content)
- [ ] `src/pages/databases/users.tsx` - content moved from `mysql-users.tsx`
- [ ] `src/pages/databases/backups.tsx` - MySQL per-database backup/restore

Cleanup:

- [ ] Delete `src/pages/vhosts.tsx` after content moved
- [ ] Delete `src/pages/ssl.tsx` after content moved
- [ ] Delete `src/pages/mysql-users.tsx` after content moved
- [ ] Delete `src/pages/databases.tsx` after content moved (replaced by workspace index)

## Phase 4 - Services Page: Open Details Navigation

_Depends on Phase 1 + Phase 3._

- [ ] Add "Open Details" button on Apache, MySQL, PHP cards in `src/pages/services.tsx` navigating to `/services/apache`, `/services/mysql`, `/services/php`
- [ ] Reduce card inline actions to: Start/Stop, Open (browser), Details only
- [ ] Remove phpMyAdmin as standalone service card; add as utility link in Apache workspace overview
- [ ] Update `src/components/services/service-card.tsx` to support minimal action variant
- [ ] Update `src/components/services/service-actions.tsx` to support minimal action variant

## Phase 5 - Dashboard Simplification

_Depends on Phase 1. Parallel with Phase 3._

- [ ] `src/components/error-log-preview.tsx` - reduce from 8 lines to 5 lines max, add "Open Full Logs" link to `/logs`
- [ ] `src/pages/dashboard.tsx` - service cards show status + health + uptime only, remove per-service config dialogs and management actions
- [ ] Dashboard card click navigates to service workspace
- [ ] Keep on dashboard: status badges, uptime, Start All/Stop All, virtual hosts summary, recent activity strip
- [ ] Target: entire dashboard visible on one screen with minimal or no scrolling

## Phase 6 - Security: Actionable Findings

_Independent._

- [ ] Add `fixAction?: () => void` to `FindingRow` component in `src/pages/security.tsx`
- [ ] Add "Fix Automatically" button to applicable findings (e.g. `display_errors=On`, missing root password)
- [ ] Show a "Preview changes" confirmation dialog before applying any automatic fix - never silently modify config files
- [ ] Severity colors: critical = red/destructive, warning = amber, info = blue using shadcn/ui `Badge` variants

## Phase 7 - Terminal Quick Launch Bar

_Independent._

- [ ] Add top bar with quick-launch buttons to `src/pages/terminal.tsx`: PowerShell, CMD, PHP CLI, Composer, MySQL CLI, Git Bash
- [ ] Each button calls `spawn_terminal` with correct shell preset and opens a new tab
- [ ] Support multiple named terminal tabs (already partially in TerminalPage - ensure tab add/close/rename works cleanly)

## Phase 8 - Settings: Backup Sub-route + New Options

_Depends on Phase 1._

- [ ] Create `src/pages/settings/layout.tsx` - tabs: General, Backup & Restore
- [ ] Create `src/pages/settings/index.tsx` - current `settings.tsx` content (theme, language, autostart)
- [ ] Create `src/pages/settings/backup.tsx` - full-app backup & restore (content from `src/pages/backup.tsx`)
- [ ] Add new General settings: Auto-start Apache, Auto-start MySQL, Minimize to tray on close, Update channel
- [ ] Wire new settings to existing `get_autostart`/`set_autostart` Tauri commands
- [ ] Rule: Settings must contain ONLY app behavior (theme, language, tray, update channel, autostart). Config editors (httpd.conf, php.ini, my.cnf) must stay inside their respective service workspaces - never in Settings.
- [ ] Delete `src/pages/settings.tsx` after content moved
- [ ] Delete `src/pages/backup.tsx` after content moved

## Consistency & Polish Rules

_Apply across all phases. These matter more than new features at this stage._

- [ ] Breadcrumb depth: max 2 levels (e.g., "Apache > SSL"). Never go deeper than 3. Avoid verbose trails like "Dashboard > Services > Apache > SSL > Certificates > Edit".
- [ ] All workspace pages must use `service-workspace-header.tsx` - no one-off headers
- [ ] Button hierarchy is consistent everywhere: primary action (filled), secondary (outline), destructive (red) - same placement rules on every page
- [ ] Terminology is locked: PHP status is "Ready" / "Installed" (never "Running"). Services are "started" / "stopped" (never "online" / "offline").
- [ ] Spacing and layout grid is consistent across all workspace pages - no page should feel visually heavier than another
- [ ] No new sidebar items - every new feature must fit into an existing workspace as a sub-route or contextual action
