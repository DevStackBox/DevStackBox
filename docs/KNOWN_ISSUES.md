# DevStackBox - Known Issues & Technical Debt

**Single source of truth for bugs, incomplete code, and things that need fixing before adding new features.**  
Read this before you start coding. Fix critical issues in this list before building new features on top of them.

---

## Priority Levels

- CRITICAL - Causes crashes, data loss, or completely broken features
- HIGH - Feature does not work or causes UX problems
- MEDIUM - Works but has bugs or limitations
- LOW - Minor issue or cleanup task

---

## Critical Issues

### ISSUE-001: `service_manager.rs` is Dead Code

**Priority:** CRITICAL  
**File:** `src-tauri/src/service_manager.rs`  
**Status:** Unresolved

**Description:**  
`service_manager.rs` contains a full `ServiceManager` struct with `start_apache()`, `start_mysql()`, `stop_service()`, and `get_service_status()` methods. This code is completely unused. The module import is commented out in `lib.rs`:

```rust
// mod service_manager;  // <-- commented out
```

All actual service management is reimplemented directly in `lib.rs`.

**Impact:**

- Confusion: future developers may try to call these methods
- Dead code generates compiler warnings
- Two different implementations of the same logic

**Resolution options:**

- Option A (Recommended): Delete `service_manager.rs` entirely since `lib.rs` has all the functionality
- Option B: Refactor `lib.rs` to use `ServiceManager` methods properly

**Do NOT add new code to `service_manager.rs`.**

---

### ISSUE-002: 30+ Rust Compiler Warnings

**Priority:** HIGH  
**File:** `src-tauri/src/lib.rs`  
**Status:** Unresolved

**Description:**  
The Rust backend generates ~30 compiler warnings on every build:

- 20x `variables can be used directly in format! string` (Clippy E0030)
- 5x `the borrowed expression implements required traits`
- 2x `needless_borrows_for_generic_args`
- 3x `dead_code` or `never used`

**Impact:**

- Build output is cluttered, making real errors hard to see
- Some warnings indicate actual bugs (dead code = forgotten features)

**Fix:**  
Run `cargo clippy --fix` in `src-tauri/` to auto-fix most format-string warnings.  
Manually fix the `dead_code` warnings by either deleting unused functions or using them.

---

### ISSUE-003: `download_php_version` is a Stub

**Priority:** HIGH  
**File:** `src-tauri/src/commands/php.rs` - `download_php_version()` command  
**Status:** Resolved (v0.1.6)

**Resolution:**
`download_php_version` is now a real implementation. It resolves the latest TS zip URL via `https://windows.php.net/downloads/releases/releases.json`, streams the download with `reqwest` (rustls), extracts into `<install>/php/{branch}/` via the `zip` crate with a path-traversal guard, copies `php.ini-production` to `php.ini` (or writes a minimal config with a `# configVersion: 1` header), and emits `php-download-progress` events with `{ version, stage, percent, downloaded, total, message }` to the frontend. `PHPVersionSelector` subscribes to those events and renders a shadcn `Progress` bar plus stage text, then refreshes the version list when `stage = "complete"`. Errors emit `stage = "error"` and surface as destructive toasts.

---

### ISSUE-004: Log Viewer Has No Real-Time Streaming

**Priority:** HIGH  
**File:** `src/components/services/log-viewer.tsx`, `src/pages/services.tsx`  
**Status:** Resolved (v0.1.6, polling implementation)

**Resolution:**
`src/pages/services.tsx` now starts a 2-second `setInterval` on mount (and whenever the selected service changes) that calls `get_service_logs` quietly and replaces the panel content. `LogViewer` watches `logs` and re-applies the active search filter; it also auto-scrolls its textarea to the bottom on new content while auto-scroll is enabled. The interval is cleared when auto-refresh is turned off, when the service changes, and on unmount. The Tauri Channel streaming variant remains a Phase 4 follow-up but is no longer required for basic UX.

---

## High Priority Issues

### ISSUE-005: Service Status Uses Two Mechanisms That Can Conflict

**Priority:** HIGH  
**File:** `src-tauri/src/lib.rs`  
**Status:** Partially fixed

**Description:**  
There are two ways to track service status:

1. `SERVICE_STATUS` (global HashMap) - internal state, not always accurate
2. `is_process_running("mysqld.exe")` - actual OS process check

`get_mysql_status()` and `get_apache_status()` now use the process check (option 2). But `start_mysql()` and `start_apache()` still write to `SERVICE_STATUS`. This can cause inconsistencies.

**Fix:**  
Remove `SERVICE_STATUS` entirely and always use `is_process_running()` for status checks.

---

### ISSUE-006: `commands.ts` Does Not Include All Commands

**Priority:** HIGH  
**File:** `src/lib/commands.ts`  
**Status:** Unresolved

**Description:**  
Some components call `safeInvoke("command_name")` with hardcoded strings instead of using `TAURI_COMMANDS`. For example, `config-editor.tsx` calls `safeInvoke<string>("read_config", ...)` directly.

**Impact:**  
If a command is renamed in Rust, the frontend will break silently in places using hardcoded strings.

**Fix:**

1. Audit all `safeInvoke` calls across the frontend
2. Move every command name into `TAURI_COMMANDS` in `src/lib/commands.ts`
3. Replace hardcoded strings with `TAURI_COMMANDS.group.commandName`

---

### ISSUE-007: `lib.rs` is Too Large

**Priority:** MEDIUM  
**File:** `src-tauri/src/lib.rs`  
**Status:** Unresolved

**Description:**  
`lib.rs` is ~1600 lines. It contains:

- Path resolution helpers
- Process management helpers
- 25+ Tauri commands
- Helper functions for MySQL, Apache, PHP config generation
- Tray setup code

**Impact:**  
Hard to navigate, hard to maintain, slow to understand for new contributors.

**Fix:**  
Split into modules:

```text
src-tauri/src/
  lib.rs            (just run() and module declarations)
  commands/
    mysql.rs        (MySQL commands)
    apache.rs       (Apache commands)
    php.rs          (PHP commands)
    config.rs       (Config read/write commands)
    logs.rs         (Log reading commands)
    system.rs       (check_binaries, debug, etc.)
  utils/
    paths.rs        (get_installation_path, etc.)
    process.rs      (is_process_running, get_process_pid)
```

**Note:** Do this as a dedicated refactoring task. Do not mix with feature work.

---

### ISSUE-008: `switch_php_version` Uses `mklink /J` Without Error Checking

**Priority:** MEDIUM  
**File:** `src-tauri/src/lib.rs` - `switch_php_version()`  
**Status:** Unresolved

**Description:**  
`switch_php_version` runs `mklink /J php\current php\{version}` via `Command::new("mklink")`. On Windows, `mklink` is a cmd.exe built-in, not a standalone executable. This will fail with "not found" errors.

**Fix:**

```rust
Command::new("cmd")
    .args(["/C", "mklink", "/J", "php\\current", &version_php_dir])
    .output()
```

---

### ISSUE-009: Path Hardcoded as Development Path in Fallback

**Priority:** MEDIUM  
**File:** `src-tauri/src/lib.rs` - `get_installation_path()`  
**Status:** Unresolved

**Description:**  
The fallback path list includes:

```rust
PathBuf::from("C:\\xampp\\htdocs\\DevStackBox"),  // dev machine path
```

This should not be in a production binary. On end-user machines this path will not exist and is just noise.

**Fix:**  
Remove the dev machine path from the fallback list. Keep only:

- `C:\dsb`
- `C:\Program Files\DevStackBox`
- `C:\DevStackBox`

---

## Medium Priority Issues

### ISSUE-010: Tray Integration Partially Working

**Priority:** MEDIUM  
**Files:** `src/hooks/useSystemTray.ts`, `src/components/SystemTrayButton.tsx`, `src/pages/SystemTrayPage.tsx`  
**Status:** Partially implemented

**Description:**  
Tray icon appears and basic menu works, but:

- `SystemTrayPage` is not functional
- Click-to-open from tray may not work consistently
- No service status in tray tooltip

---

### ISSUE-011: Auto-Updater Not Fully Tested

**Priority:** MEDIUM  
**Files:** `src/components/auto-updater.tsx`, `src-tauri/tauri.conf.json`  
**Status:** Plugin configured, flow untested

**Description:**  
`tauri-plugin-updater` is installed and the `AutoUpdater` component exists, but the updater endpoint is not configured in `tauri.conf.json`. The update flow has never been tested end-to-end.

**Fix required:**

1. Add `updater` config to `tauri.conf.json` pointing to GitHub Releases JSON endpoint
2. Generate a signing key and configure it in GitHub Secrets
3. Test the full update flow on a real installed build

---

### ISSUE-012: `SystemTrayPage.tsx` Has No Real Functionality

**Priority:** LOW  
**File:** `src/pages/SystemTrayPage.tsx`  
**Status:** Placeholder only

**Description:**  
The page exists but has no working functionality. Tray settings are not saved.

---

## Low Priority Issues

### ISSUE-013: `DebugPanel.tsx` Should Not Ship in Production

**Priority:** LOW  
**File:** `src/components/DebugPanel.tsx`  
**Status:** Present in codebase

**Description:**  
The debug panel is useful in development but should not be visible in production builds.

**Fix:**  
Wrap it in a `isDev` check or use Tauri's `#[cfg(debug_assertions)]` equivalent:

```tsx
{
  import.meta.env.DEV && <DebugPanel />;
}
```

---

### ISSUE-014: `create_default_apache_config()` Sets www Root to Empty Directory

**Priority:** LOW  
**File:** `src-tauri/src/lib.rs`  
**Status:** Minor

**Description:**  
Auto-generated `httpd.conf` sets `DocumentRoot` to the `www/` directory. If `www/` is empty, Apache shows a directory listing which may confuse users.

**Fix:**  
Ensure `www/index.php` or `www/index.html` always exists in the installation.

---

## Things That Were Fixed (Reference)

| Issue                                          | Fix                                     | Version |
| ---------------------------------------------- | --------------------------------------- | ------- |
| MSI version format (`0.1.0-alpha.6` broke MSI) | Changed to `0.1.6` clean semver         | v0.1.6  |
| `globals.css` accidentally deleted             | Restored                                | v0.1.6  |
| `main.tsx` accidentally deleted                | Restored                                | v0.1.6  |
| GitHub Actions emoji encoding broke PowerShell | Removed all emoji from `.yml` files     | v0.1.6  |
| Duplicate `ServiceStatus` type in 3 files      | Consolidated to `src/types/services.ts` | v0.1.6  |
| Apache `get_apache_status` missing from Rust   | Added command                           | v0.1.6  |
| Config management commands missing             | Added all 5 config commands             | v0.1.6  |
