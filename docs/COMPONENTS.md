# DevStackBox - Component Inventory

**Single Source of Truth for all React components.**  
Before writing a new component, check this file to see if one already exists that can be reused or extended.

---

## Quick Lookup

| Component            | File                                      | Purpose                                  | Reusable?                 |
| -------------------- | ----------------------------------------- | ---------------------------------------- | ------------------------- |
| `ThemeProvider`      | `components/theme-provider.tsx`           | Wraps entire app with dark/light context | No (app-level)            |
| `ThemeToggle`        | `components/theme-toggle.tsx`             | Dark/Light mode button                   | Yes                       |
| `LanguageSwitcher`   | `components/language-switcher.tsx`        | EN/HI dropdown                           | Yes                       |
| `Sidebar`            | `components/sidebar.tsx`                  | Left navigation rail                     | No (app-level)            |
| `CommandPalette`     | `components/command-palette.tsx`          | Ctrl+P search/action palette             | No (app-level)            |
| `ConfigEditor`       | `components/config-editor.tsx`            | Modal for editing config files           | Yes (pass `service` prop) |
| `AutoUpdater`        | `components/auto-updater.tsx`             | Update check + install UI                | No (app-level)            |
| `PHPVersionSelector` | `components/php-version-selector.tsx`     | PHP version picker modal                 | No (service-specific)     |
| `DebugPanel`         | `components/DebugPanel.tsx`               | Dev-only debug info panel                | No (dev only)             |
| `WindowControls`     | `components/WindowControls.tsx`           | Custom title bar buttons                 | No (app-level)            |
| `SystemTrayButton`   | `components/SystemTrayButton.tsx`         | Minimize to tray button                  | Yes                       |
| `SystemTrayStatus`   | `components/SystemTrayStatus.tsx`         | Tray-area status indicator               | Yes                       |
| `ServiceManager`     | `components/services/service-manager.tsx` | Polls + manages all services             | No (orchestrator)         |
| `ServiceCard`        | `components/services/service-card.tsx`    | Single service display card              | Yes                       |
| `ServiceActions`     | `components/services/service-actions.tsx` | Start/Stop/Open buttons                  | Yes                       |
| `StatusBadge`        | `components/services/status-badge.tsx`    | Running/Stopped badge                    | Yes                       |
| `LogViewer`          | `components/services/log-viewer.tsx`      | Scrollable log output                    | Yes                       |
| `MySQLService`       | `components/services/mysql-service.tsx`   | MySQL-specific service UI                | No                        |
| `ApacheService`      | `components/services/apache-service.tsx`  | Apache-specific service UI               | No                        |
| `PHPService`         | `components/services/php-service.tsx`     | PHP-specific service UI                  | No                        |

---

## Pages

| Page Component   | File                       | Route                 | Status         |
| ---------------- | -------------------------- | --------------------- | -------------- |
| `DashboardPage`  | `pages/dashboard.tsx`      | `dashboard` (default) | Working        |
| `ServicesPage`   | `pages/services.tsx`       | `services`            | Partial        |
| `SystemTrayPage` | `pages/SystemTrayPage.tsx` | `tray`                | Not functional |

---

## Detailed Component Docs

### App.tsx (Root)

**File:** `src/App.tsx`  
**Purpose:** Top-level application shell. Handles page routing, keyboard shortcuts, modal states.  
**State managed here:**

- `currentPage` - which page is shown
- `sidebarCollapsed` - sidebar collapsed state
- `commandPaletteOpen` - Ctrl+P modal open
- `phpVersionSelectorOpen` - PHP version modal open
- `configEditorOpen` - config editor modal open
- `configService` - which service's config is being edited

**Do NOT add feature logic to App.tsx.** It should only handle layout and routing.

---

### ThemeProvider

**File:** `src/components/theme-provider.tsx`  
**Purpose:** Wraps the entire app and provides dark/light theme context.  
**Usage:** Already wraps everything in `App.tsx`. Do not move or duplicate.  
**Pattern:** Uses shadcn/ui's theme system. Class `dark` on `<html>` element.

---

### ThemeToggle

**File:** `src/components/theme-toggle.tsx`  
**Purpose:** Button to switch between dark and light mode.  
**Props:** None  
**Usage:** `<ThemeToggle />`  
**Reuse:** Can be placed anywhere in the top bar.

---

### LanguageSwitcher

**File:** `src/components/language-switcher.tsx`  
**Purpose:** Dropdown to switch between English and Hindi (i18next).  
**Props:** None  
**Usage:** `<LanguageSwitcher />`  
**Translation keys used:** `common.english`, `common.hindi`

---

### Sidebar

**File:** `src/components/sidebar.tsx`  
**Purpose:** Main navigation sidebar with page links and collapse toggle.  
**Props:**

```ts
interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}
```

**Pages registered:** dashboard, services, tray  
**Rule:** Add new pages here and in `App.tsx`.

---

### CommandPalette

**File:** `src/components/command-palette.tsx`  
**Purpose:** Ctrl+P / Cmd+P quick-action palette using shadcn/ui `Command`.  
**Props:**

```ts
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onServiceToggle: (service: string) => void;
  onPageChange: (page: string) => void;
}
```

**Trigger:** Keyboard shortcut in `App.tsx`.

---

### ConfigEditor

**File:** `src/components/config-editor.tsx`  
**Purpose:** Modal dialog for reading/editing/backing up config files.  
**Props:**

```ts
interface ConfigEditorProps {
  open: boolean;
  onClose: () => void;
  service: ServiceName; // "mysql" | "apache" | "php" | "phpmyadmin"
}
```

**Tauri commands used:** `read_config`, `update_config`, `backup_config`, `list_config_backups`, `restore_config_backup`  
**Reuse:** Yes. Pass a different `service` prop to edit any service's config.  
**Note:** Uses plain `<textarea>` for now. Monaco editor is a planned upgrade.

---

### AutoUpdater

**File:** `src/components/auto-updater.tsx`  
**Purpose:** Checks GitHub Releases for app updates and shows install prompt.  
**Status:** Partially working. Tauri updater plugin is configured but not fully tested.  
**Tauri plugin used:** `@tauri-apps/plugin-updater`

---

### PHPVersionSelector

**File:** `src/components/php-version-selector.tsx`  
**Purpose:** Modal to view installed PHP versions and switch/download versions.  
**Props:**

```ts
interface PHPVersionSelectorProps {
  open: boolean;
  onClose: () => void;
  currentVersion: string;
  onVersionChange: (version: string) => void;
}
```

**Tauri commands used:** `get_php_versions`, `switch_php_version`, `download_php_version`  
**Note:** `download_php_version` is currently a stub - no real download happens.

---

### ServiceManager (Orchestrator - Do Not Duplicate Its Logic)

**File:** `src/components/services/service-manager.tsx`  
**Purpose:** Central component that polls service status every 5 seconds and exposes start/stop handlers to children.  
**Props:**

```ts
interface ServiceManagerProps {
  onStatusChange?: (statuses: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  }) => void;
  onServiceToggle?: (service: string, status: boolean) => void;
  showControls?: boolean;
}
```

**Tauri commands used:** `get_apache_status`, `get_mysql_status`, `get_php_status`, `toggle_mysql`, `toggle_apache`, `toggle_php`, `backup_mysql_database`, `open_php_terminal`  
**Rule:** All service polling logic lives here. Do NOT create another polling loop in any other component.

---

### ServiceCard

**File:** `src/components/services/service-card.tsx`  
**Purpose:** Generic card shell for displaying a service (name, icon, status, actions).  
**Props:**

```ts
interface ServiceCardProps {
  name: string;
  icon: ReactNode;
  status: ServiceStatus;
  children?: ReactNode; // Extra content below the header
}
```

**Reuse:** Use this for any service. Pass children for service-specific controls.

---

### ServiceActions

**File:** `src/components/services/service-actions.tsx`  
**Purpose:** Start / Stop / Open Browser buttons for a service.  
**Props:**

```ts
interface ServiceActionsProps {
  service: string;
  status: ServiceStatus;
  onToggle: () => void;
  url?: string; // URL to open in browser on "Open" click
  loading?: boolean;
}
```

---

### StatusBadge

**File:** `src/components/services/status-badge.tsx`  
**Purpose:** Small badge showing "Running" (green) or "Stopped" (gray).  
**Props:**

```ts
interface StatusBadgeProps {
  running: boolean;
}
```

**Reuse:** Use anywhere a running/stopped status needs to be displayed.

---

### LogViewer

**File:** `src/components/services/log-viewer.tsx`  
**Purpose:** Scrollable, auto-scrolling log output area.  
**Props:**

```ts
interface LogViewerProps {
  content: string;
  maxLines?: number; // Default: 500
  autoScroll?: boolean; // Default: true
}
```

**Note:** Currently renders plain text. Real-time streaming not yet implemented.

---

### MySQLService / ApacheService / PHPService

**Files:** `components/services/mysql-service.tsx`, `apache-service.tsx`, `php-service.tsx`  
**Purpose:** Service-specific UI sections combining ServiceCard + StatusBadge + ServiceActions + LogViewer.  
**Props:** Each takes `status: ServiceStatus` and `onToggle: () => void`.  
**Rule:** Service-specific UI logic goes here, not in ServiceManager.

---

## shadcn/ui Base Components (`src/components/ui/`)

These are standard shadcn/ui components. **Do NOT modify these files.**  
If you need a new shadcn component, add it via `npx shadcn add <component>`.

| Component      | File                   | Notes                                   |
| -------------- | ---------------------- | --------------------------------------- |
| `Button`       | `ui/button.tsx`        | Standard button with variants           |
| `Badge`        | `ui/badge.tsx`         | Inline status badge                     |
| `Card`         | `ui/card.tsx`          | Card container with header/content      |
| `Dialog`       | `ui/dialog.tsx`        | Modal dialogs                           |
| `DropdownMenu` | `ui/dropdown-menu.tsx` | Dropdown menus                          |
| `Input`        | `ui/input.tsx`         | Text input                              |
| `Textarea`     | `ui/textarea.tsx`      | Multi-line text                         |
| `Progress`     | `ui/progress.tsx`      | Progress bar                            |
| `Toast`        | `ui/toast.tsx`         | Toast notification                      |
| `Toaster`      | `ui/toaster.tsx`       | Toast container (app-level)             |
| `Skeleton`     | `ui/skeleton.tsx`      | Loading skeleton                        |
| `EmptyState`   | `ui/empty-state.tsx`   | Custom empty state (NOT shadcn - local) |

---

## TypeScript Shared Types (`src/types/services.ts`)

**Rule:** All shared types live in this one file. Never duplicate a type.

```ts
// Current types in src/types/services.ts
export type ServiceName = "mysql" | "apache" | "php" | "phpmyadmin";

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

export interface PHPVersion {
  version: string;
  status: "installed" | "available" | "downloading";
  path: string;
  is_active: boolean;
  installed: boolean;
  download_url: string;
}
```

---

## Utility Functions (`src/lib/`)

| Function                  | File             | Purpose                                                    |
| ------------------------- | ---------------- | ---------------------------------------------------------- |
| `isTauri()`               | `lib/tauri.ts`   | Returns true if running in Tauri (not browser)             |
| `safeInvoke<T>()`         | `lib/tauri.ts`   | Calls a Tauri command safely; returns null in browser mode |
| `getMockServiceStatus()`  | `lib/tauri.ts`   | Returns fake status for browser-mode dev                   |
| `getMockBinariesStatus()` | `lib/tauri.ts`   | Returns fake binary status for browser-mode dev            |
| `cn(...classes)`          | `lib/utils.ts`   | Merges Tailwind class names (from shadcn)                  |
| `APP_VERSION`             | `lib/version.ts` | Current version string ("0.1.6")                           |

---

## Component Creation Rules

1. All styling uses Tailwind CSS classes only. No inline styles, no custom CSS files.
2. All animations use Framer Motion. No CSS keyframes.
3. All text that shows to the user goes through `useTranslation()` from i18next.
4. All Tauri calls go through `safeInvoke()` from `lib/tauri.ts`.
5. Use shadcn/ui `Dialog` for modals, `DropdownMenu` for menus, `Tabs` for sub-navigation.
6. Support dark/light mode automatically by using Tailwind `dark:` variants or shadcn/ui components.
7. Mark new components in this file as soon as you create them.
