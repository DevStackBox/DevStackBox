# DevStackBox - Tauri Commands Reference

**Single Source of Truth for all backend IPC commands.**  
Every command that exists in `src-tauri/src/lib.rs` is documented here.  
Every command name used in the frontend must match exactly what is listed here.

**Rule:** Before writing `safeInvoke("some_command")` anywhere in the frontend, check this file first. If the command does not exist here, it does not exist in the backend.

---

## How to Use This Reference

1. Find the command you need in the table below.
2. Check its parameters and return type.
3. Use the exact command name string from the "Command Name" column.
4. Add it to `src/lib/commands.ts:TAURI_COMMANDS` if it is not already there.
5. Call it via `safeInvoke<ReturnType>("command_name", { params })`.

---

## Frontend Constants File

Shared command names are being centralized in `src/lib/commands.ts`. This should become the only place command name strings live.

**Current state:** Service commands are already mapped in `TAURI_COMMANDS.services`. Config-related calls still need to be migrated from hardcoded strings.

**Pattern:**

```ts
// src/lib/commands.ts
export const TAURI_COMMANDS = {
  services: {
    getMysqlStatus: "get_mysql_status",
    toggleMysql: "toggle_mysql",
    getApacheStatus: "get_apache_status",
    toggleApache: "toggle_apache",
    getPhpStatus: "get_php_status",
    togglePhp: "toggle_php",
    getServiceLogs: "get_service_logs",
    backupMysqlDatabase: "backup_mysql_database",
    openPhpTerminal: "open_php_terminal",
  },
};
```

---

## Command Reference Table

### System Commands

| Command Name                 | Rust Function                  | Parameters | Returns                                                   | Status               | Used By                 |
| ---------------------------- | ------------------------------ | ---------- | --------------------------------------------------------- | -------------------- | ----------------------- |
| `check_binaries`             | `check_binaries()`             | none       | `HashMap<String, bool>` keys: `mysql`, `apache`, `php8.2` | Working              | `App.tsx`               |
| `stop_all_services`          | `stop_all_services()`          | none       | `String` (summary message)                                | Working              | Not yet hooked up in UI |
| `create_directory_structure` | `create_directory_structure()` | none       | `String` (success msg)                                    | Working              | Not yet called from UI  |
| `debug_paths`                | `debug_paths()`                | none       | `HashMap<String, String>`                                 | Working (debug only) | `DebugPanel.tsx`        |
| `debug_installation`         | `debug_installation()`         | none       | `HashMap<String, String>`                                 | Working (debug only) | `DebugPanel.tsx`        |

### MySQL Commands

| Command Name            | Rust Function             | Parameters | Returns                   | Status  | Used By               |
| ----------------------- | ------------------------- | ---------- | ------------------------- | ------- | --------------------- |
| `start_mysql`           | `start_mysql()`           | none       | `bool`                    | Working | `service-manager.tsx` |
| `stop_mysql`            | `stop_mysql()`            | none       | `bool`                    | Working | `service-manager.tsx` |
| `get_mysql_status`      | `get_mysql_status()`      | none       | `ServiceInfo`             | Working | `service-manager.tsx` |
| `toggle_mysql`          | `toggle_mysql()`          | none       | `bool` (new state)        | Working | `service-manager.tsx` |
| `backup_mysql_database` | `backup_mysql_database()` | none       | `String` (path to backup) | Working | `service-manager.tsx` |

### Apache Commands

| Command Name         | Rust Function          | Parameters | Returns            | Status  | Used By                |
| -------------------- | ---------------------- | ---------- | ------------------ | ------- | ---------------------- |
| `start_apache`       | `start_apache()`       | none       | `bool`             | Working | `service-manager.tsx`  |
| `stop_apache`        | `stop_apache()`        | none       | `bool`             | Working | `service-manager.tsx`  |
| `get_apache_status`  | `get_apache_status()`  | none       | `ServiceInfo`      | Working | `service-manager.tsx`  |
| `toggle_apache`      | `toggle_apache()`      | none       | `bool` (new state) | Working | `service-manager.tsx`  |
| `test_apache_config` | `test_apache_config()` | none       | `String`           | Working | Not yet called from UI |

### PHP Commands

| Command Name           | Rust Function                                           | Parameters        | Returns            | Status                                                                                    | Used By                    |
| ---------------------- | ------------------------------------------------------- | ----------------- | ------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| `get_php_status`       | `get_php_status()`                                      | none              | `ServiceInfo`      | Working                                                                                   | `service-manager.tsx`      |
| `toggle_php`           | `toggle_php()`                                          | none              | `bool`             | Stub only                                                                                 | `service-manager.tsx`      |
| `get_php_versions`     | `get_php_versions()`                                    | none              | `PHPVersionInfo[]` | Working                                                                                   | `php-version-selector.tsx` |
| `switch_php_version`   | `switch_php_version(version)`                           | `version: String` | `bool`             | Working (Windows only)                                                                    | `php-version-selector.tsx` |
| `download_php_version` | `download_php_version(app: AppHandle, version: String)` | `version: String` | `bool`             | Working - streams real PHP zip from windows.php.net; emits `php-download-progress` events | `php-version-selector.tsx` |
| `open_php_terminal`    | `open_php_terminal(version)`                            | `version: String` | `String`           | Working (Windows only)                                                                    | `service-manager.tsx`      |

### Log Commands

| Command Name       | Rust Function               | Parameters        | Returns                | Status  | Used By                  |
| ------------------ | --------------------------- | ----------------- | ---------------------- | ------- | ------------------------ |
| `get_service_logs` | `get_service_logs(service)` | `service: String` | `String` (log content) | Working | `services.tsx` (partial) |

### Config Commands

| Command Name            | Rust Function                                 | Parameters                               | Returns                 | Status  | Used By             |
| ----------------------- | --------------------------------------------- | ---------------------------------------- | ----------------------- | ------- | ------------------- |
| `read_config`           | `read_config(service)`                        | `service: String`                        | `String` (file content) | Working | `config-editor.tsx` |
| `update_config`         | `update_config(service, content)`             | `service: String`, `content: String`     | `String` (success msg)  | Working | `config-editor.tsx` |
| `backup_config`         | `backup_config(service)`                      | `service: String`                        | `String` (backup path)  | Working | `config-editor.tsx` |
| `list_config_backups`   | `list_config_backups(service)`                | `service: String`                        | `String[]`              | Working | `config-editor.tsx` |
| `restore_config_backup` | `restore_config_backup(service, backup_name)` | `service: String`, `backup_name: String` | `String` (success msg)  | Working | `config-editor.tsx` |

---

## Shared Rust Types

These structs are returned by commands. Their TypeScript equivalents are in `src/types/services.ts`.

### `ServiceInfo` (Rust) = `ServiceStatus` (TypeScript)

```rust
// src-tauri/src/lib.rs
#[derive(serde::Serialize)]
struct ServiceInfo {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    version: Option<String>,
}
```

```ts
// src/types/services.ts
export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}
```

### `PHPVersionInfo` (Rust) = `PHPVersion` (TypeScript)

```rust
// src-tauri/src/lib.rs
#[derive(serde::Serialize)]
struct PHPVersionInfo {
    version: String,
    status: String,     // "installed" | "available" | "downloading"
    path: String,
    is_active: bool,
    installed: bool,
    download_url: String,
}
```

---

## Valid `service` Parameter Values

Many commands accept a `service: String` parameter. Valid values are:

| Value                   | Maps to Config File      | Notes                    |
| ----------------------- | ------------------------ | ------------------------ |
| `"mysql"`               | `config/my.cnf`          |                          |
| `"apache"` or `"httpd"` | `config/httpd.conf`      | Both are accepted        |
| `"php"`                 | `php/8.2/php.ini`        | Hardcoded to 8.2 for now |
| `"phpmyadmin"`          | `config/phpmyadmin.conf` |                          |

---

## Commands Registered in invoke_handler

The `run()` function in `lib.rs` registers all commands. If a command is not listed here, it cannot be called from the frontend:

```rust
// src-tauri/src/lib.rs -> run()
tauri::generate_handler![
    check_binaries,
    debug_paths,
    debug_installation,
    stop_all_services,
    test_apache_config,
    get_mysql_status,
    start_mysql,
    stop_mysql,
    get_php_status,
    get_php_versions,
    switch_php_version,
    download_php_version,
    get_apache_status,
    start_apache,
    stop_apache,
    toggle_mysql,
    toggle_apache,
    toggle_php,
    backup_mysql_database,
    open_php_terminal,
    get_service_logs,
    read_config,
    update_config,
    backup_config,
    list_config_backups,
    restore_config_backup,
    create_directory_structure,
]
```

---

## Missing / Planned Commands

These are commands the frontend calls or will need but do not yet exist in Rust:

| Command Name           | Purpose                                    | Priority |
| ---------------------- | ------------------------------------------ | -------- |
| `get_logs_realtime`    | Stream log file tail via Tauri Channel     | High     |
| `open_in_browser`      | Open URL in default browser                | Medium   |
| `get_app_info`         | Return version, install path, memory usage | Medium   |
| `check_port`           | Check if a specific port is in use         | Medium   |
| `reset_mysql_password` | Reset MySQL root password                  | Low      |

---

## Adding a New Command

1. Add the Rust function in `src-tauri/src/lib.rs`:

   ```rust
   #[tauri::command]
   async fn my_new_command(param: String) -> Result<String, String> {
       Ok(format!("result: {}", param))
   }
   ```

2. Register it in `run()` at the bottom of `lib.rs`:

   ```rust
   tauri::generate_handler![
       // ...existing commands...
       my_new_command,
   ]
   ```

3. Add the constant to `src/lib/commands.ts`:

   ```ts
   export const TAURI_COMMANDS = {
     someGroup: {
       myNewCommand: "my_new_command",
     },
   };
   ```

4. Call it from the frontend:

   ```ts
   const result = await safeInvoke<string>(
     TAURI_COMMANDS.someGroup.myNewCommand,
     { param: "value" },
   );
   ```

5. Update this document.
