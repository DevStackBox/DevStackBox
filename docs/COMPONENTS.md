# DevStackBox - Component Inventory

**Single Source of Truth for all React components.**  
Before writing a new component, check this file to see if one already exists that can be reused or extended.

**Primary rule:** If the UI, action, or layout is similar to an existing component, extend the existing component with props, slots, or children before creating a sibling component.

## Reuse Workflow

1. Check the Quick Lookup table for an existing match.
2. If the behavior is similar, extend the existing component instead of copying its JSX or logic.
3. If the logic is shared across services, move it into the shared component or a shared helper.
4. If you must create something new, make it generic enough for the next similar use case and document it here immediately.

## Reuse Priorities

- Service presentation: reuse `ServiceCard`, `StatusBadge`, `ServiceActions`, and `LogViewer`.
- Shared dialogs and modal flows: reuse `ConfigEditor`, `PHPVersionSelector`, and shadcn `Dialog` primitives.
- Navigation and app shell: reuse `Sidebar`, `CommandPalette`, `ThemeToggle`, `LanguageSwitcher`, and `AutoUpdater`.
- Shared service logic: reuse `ServiceManager`, `safeInvoke()`, `TAURI_COMMANDS`, and types in `src/types/services.ts`.

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

| Page Component   | File                       | Route                 | Status       |
| ---------------- | -------------------------- | --------------------- | ------------ |
| `DashboardPage`  | `pages/dashboard.tsx`      | `dashboard` (default) | Working      |
| `ServicesPage`   | `pages/services.tsx`       | `services`            | Partial      |
| `Projects`       | `App.tsx` inline branch    | `projects`            | Placeholder  |
| `Logs`           | `App.tsx` inline branch    | `logs`                | Placeholder  |
| `Settings`       | `App.tsx` inline branch    | `settings`            | Partial      |
| `About`          | `App.tsx` inline branch    | `about`               | Working      |
| `SystemTrayPage` | `pages/SystemTrayPage.tsx` | not mounted           | Experimental |

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
  onToggleCollapse: () => void;
}
```

**Pages registered:** dashboard, services, projects, logs, settings, about  
**Rule:** Add new pages here and in `App.tsx`.

---

### CommandPalette

**File:** `src/components/command-palette.tsx`  
**Purpose:** Ctrl+P / Cmd+P quick-action palette using shadcn/ui `Command`.  
**Props:**

```ts
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onPageChange: (page: string) => void;
  onServiceToggle: (service: string) => void;
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
  isOpen: boolean;
  onClose: () => void;
  service: ServiceName; // "mysql" | "apache" | "php" | "phpmyadmin"
}
```

**Tauri commands used:** `read_config`, `update_config`, `backup_config`  
**Reuse:** Yes. Pass a different `service` prop to edit any supported service config.  
**Extension rule:** Add validation, syntax helpers, or backup history to this component instead of building separate config dialogs per service.

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
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
  onVersionChange: (version: string) => void;
}
```

**Status:** Currently a frontend-managed selector with simulated downloads and local version switching state.  
**Extension rule:** Keep version-card layout centralized here. Do not create separate selectors elsewhere.

---

### ServiceManager (Orchestrator - Do Not Duplicate Its Logic)

**File:** `src/components/services/service-manager.tsx`  
**Purpose:** Central component that polls service status every 5 seconds and exposes start/stop handlers to children.  
**Props:**

```ts
interface ServiceManagerProps {
  compact?: boolean;
  onServiceToggle?: (service: string, status: boolean) => void;
  onOpenConfig?: (service: string) => void;
  onViewLogs?: (service: string) => void;
  onOpenPHPVersionSelector?: () => void;
  currentPhpVersion?: string;
  onStatusesChange?: (statuses: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  }) => void;
}
```

**Tauri commands used:** `get_apache_status`, `get_mysql_status`, `get_php_status`, `toggle_mysql`, `toggle_apache`, `toggle_php`, `backup_mysql_database`, `open_php_terminal`  
**Rule:** All service polling logic lives here. Do NOT create another polling loop in any other component.
**Extension rule:** New cross-service actions should be added here or below this layer, not reimplemented in each service card.

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
  logs: string;
  onClear?: () => void;
  onRefresh?: () => void;
  title?: string;
  description?: string;
  searchable?: boolean;
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  loading?: boolean;
}
```

**Reuse:** Use this for log display, search, copy, download, and clear behavior instead of making per-service log blocks.  
**Note:** Currently renders plain text with manual refresh. Real-time streaming is not implemented yet.

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
5. Command names must come from `src/lib/commands.ts`. Do not hardcode command strings in new components.
6. Support dark/light mode automatically by using Tailwind `dark:` variants or shadcn/ui components.
7. Use shadcn/ui `Dialog` for modals, `DropdownMenu` for menus, `Tabs` for sub-navigation.
8. Extend existing shared components before creating parallel ones for similar UI.
9. Mark new components in this file as soon as you create them.
