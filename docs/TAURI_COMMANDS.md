# DevStackBox - Tauri Commands Reference

**Single source of truth for all backend IPC commands.**
Every command registered in `src-tauri/src/lib.rs` (`generate_handler!`) is documented here.
Every command name used in the frontend must match exactly what is listed here.

**Rule:** Before writing ``safeInvoke("some_command")`` anywhere in the frontend, check this file first. If the command is not listed here, it does not exist in the backend.

---

## How to Use This Reference

1. Find the command you need in the table below.
2. Check its parameters and return type.
3. Use the exact command name string from the "Command Name" column.
4. If it is not already in `src/lib/commands.ts:TAURI_COMMANDS`, add it there.
5. Call it via `safeInvoke<ReturnType>(TAURI_COMMANDS.group.commandName, { params })`.

---

## Frontend Constants File

All command name strings are centralized in `src/lib/commands.ts` in the `TAURI_COMMANDS` constant.
Do not use hardcoded command name strings in component files.

**Pattern:**

```ts
const result = await safeInvoke<ReturnType>(
  TAURI_COMMANDS.group.commandName,
  { paramName: value },
);
```

---

## Command Reference

### System Commands

| Command Name                 | Source File               | Parameters       | Returns                    | Notes                    |
| ---------------------------- | ------------------------- | ---------------- | -------------------------- | ------------------------ |
| `check_binaries`             | `commands/system.rs`      | none             | `HashMap<String, bool>`    | Keys: mysql, apache, php |
| `debug_paths`                | `commands/system.rs`      | none             | `HashMap<String, String>`  | Debug only               |
| `debug_installation`         | `commands/system.rs`      | none             | `HashMap<String, String>`  | Debug only               |
| `start_all_services`         | `commands/system.rs`      | none             | `String` (summary)         |                          |
| `stop_all_services`          | `commands/system.rs`      | none             | `String` (summary)         |                          |
| `create_directory_structure` | `commands/system.rs`      | none             | `String`                   |                          |
| `get_system_info`            | `commands/system.rs`      | none             | `SystemInfo`               | OS, versions, paths      |
| `get_autostart`              | `commands/system.rs`      | none             | `bool`                     | Launch-on-login state    |
| `set_autostart`              | `commands/system.rs`      | `enabled: bool`  | `String`                   |                          |

### Tray / Window Commands

| Command Name       | Source File         | Parameters        | Returns | Notes                       |
| ------------------ | ------------------- | ----------------- | ------- | --------------------------- |
| `show_main_window` | `commands/tray.rs`  | none              | `()`    |                             |
| `hide_to_tray`     | `commands/tray.rs`  | none              | `()`    |                             |
| `set_tray_tooltip` | `commands/tray.rs`  | `tooltip: String` | `()`    | Called on every status poll |
| `quit_app`         | `commands/tray.rs`  | none              | `()`    |                             |

### MySQL Commands

| Command Name                    | Source File          | Parameters                                              | Returns                    | Notes               |
| ------------------------------- | -------------------- | ------------------------------------------------------- | -------------------------- | ------------------- |
| `start_mysql`                   | `commands/mysql.rs`  | none                                                    | `bool`                     |                     |
| `stop_mysql`                    | `commands/mysql.rs`  | none                                                    | `bool`                     |                     |
| `get_mysql_status`              | `commands/mysql.rs`  | none                                                    | `ServiceInfo`              |                     |
| `toggle_mysql`                  | `commands/mysql.rs`  | none                                                    | `bool` (new running state) |                     |
| `test_mysql_config`             | `commands/mysql.rs`  | none                                                    | `String`                   |                     |
| `backup_mysql_database`         | `commands/mysql.rs`  | none                                                    | `String` (path)            | Dumps all databases |
| `backup_mysql_database_named`   | `commands/mysql.rs`  | `database: String`                                      | `String` (path)            |                     |
| `list_mysql_databases`          | `commands/mysql.rs`  | none                                                    | `String[]`                 |                     |
| `list_mysql_databases_detailed` | `commands/mysql.rs`  | none                                                    | `DatabaseInfo[]`           | name + table count + size |
| `restore_mysql_database`        | `commands/mysql.rs`  | `backup_path: String`                                   | `String`                   |                     |
| `list_mysql_users`              | `commands/mysql.rs`  | none                                                    | `MySqlUser[]`              |                     |
| `create_mysql_user`             | `commands/mysql.rs`  | `username: String`, `password: String`, `host: String`  | `String`                   |                     |
| `drop_mysql_user`               | `commands/mysql.rs`  | `username: String`, `host: String`                      | `String`                   |                     |
| `set_mysql_user_password`       | `commands/mysql.rs`  | `username: String`, `host: String`, `password: String`  | `String`                   |                     |

### Apache Commands

| Command Name         | Source File          | Parameters | Returns   | Notes           |
| -------------------- | -------------------- | ---------- | --------- | --------------- |
| `start_apache`       | `commands/apache.rs` | none       | `bool`    |                 |
| `stop_apache`        | `commands/apache.rs` | none       | `bool`    |                 |
| `get_apache_status`  | `commands/apache.rs` | none       | `ServiceInfo` |             |
| `toggle_apache`      | `commands/apache.rs` | none       | `bool`    |                 |
| `test_apache_config` | `commands/apache.rs` | none       | `String`  | Runs `httpd -t` |

### PHP Commands

| Command Name           | Source File       | Parameters                                              | Returns            | Notes                                   |
| ---------------------- | ----------------- | ------------------------------------------------------- | ------------------ | --------------------------------------- |
| `get_php_status`       | `commands/php.rs` | none                                                    | `ServiceInfo`      |                                         |
| `toggle_php`           | `commands/php.rs` | none                                                    | `bool`             | Currently a stub                        |
| `get_php_versions`     | `commands/php.rs` | none                                                    | `PHPVersionInfo[]` |                                         |
| `switch_php_version`   | `commands/php.rs` | `version: String`                                       | `bool`             | Creates `php/current` junction via cmd  |
| `download_php_version` | `commands/php.rs` | `version: String`                                       | `bool`             | Streams from windows.php.net; emits `php-download-progress` events |
| `list_php_extensions`  | `commands/php.rs` | `version: String`                                       | `PHPExtension[]`   |                                         |
| `toggle_php_extension` | `commands/php.rs` | `version: String`, `extension: String`, `enabled: bool` | `String`           |                                         |
| `open_php_terminal`    | `commands/php.rs` | `version: String`                                       | `String`           | Opens Windows Terminal with PHP in PATH |

### Log Commands

| Command Name       | Source File        | Parameters                           | Returns                | Notes                    |
| ------------------ | ------------------ | ------------------------------------ | ---------------------- | ------------------------ |
| `get_service_logs` | `commands/logs.rs` | `service: String`                    | `String` (log content) | Last N lines of log file |
| `log_crash_event`  | `commands/logs.rs` | `service: String`, `message: String` | `String`               |                          |

### Config Commands

| Command Name            | Source File            | Parameters                               | Returns                 | Notes |
| ----------------------- | ---------------------- | ---------------------------------------- | ----------------------- | ----- |
| `read_config`           | `commands/config.rs`   | `service: String`                        | `String` (file content) |       |
| `update_config`         | `commands/config.rs`   | `service: String`, `content: String`     | `String`                |       |
| `backup_config`         | `commands/config.rs`   | `service: String`                        | `String` (backup path)  |       |
| `list_config_backups`   | `commands/config.rs`   | `service: String`                        | `String[]`              |       |
| `restore_config_backup` | `commands/config.rs`   | `service: String`, `backup_name: String` | `String`                |       |

### Terminal Commands

| Command Name            | Source File              | Parameters                                        | Returns  | Notes              |
| ----------------------- | ------------------------ | ------------------------------------------------- | -------- | ------------------ |
| `spawn_terminal`        | `commands/terminal.rs`   | `id: String`, `command: String`, `args: String[]` | `String` | Starts PTY session |
| `send_terminal_input`   | `commands/terminal.rs`   | `id: String`, `input: String`                     | `String` |                    |
| `kill_terminal_session` | `commands/terminal.rs`   | `id: String`                                      | `String` |                    |

### Security Commands

| Command Name      | Source File             | Parameters | Returns          | Notes                              |
| ----------------- | ----------------------- | ---------- | ---------------- | ---------------------------------- |
| `analyze_security`| `commands/security.rs`  | none       | `SecurityReport` | Checks config and file permissions |

### SSL Commands

| Command Name        | Source File       | Parameters | Returns    | Notes                                    |
| ------------------- | ----------------- | ---------- | ---------- | ---------------------------------------- |
| `get_ssl_status`    | `commands/ssl.rs` | none       | `SslStatus`|                                          |
| `generate_ssl_cert` | `commands/ssl.rs` | none       | `String`   | Generates self-signed cert for localhost |
| `enable_ssl`        | `commands/ssl.rs` | none       | `String`   | Updates httpd.conf to load ssl_module    |
| `disable_ssl`       | `commands/ssl.rs` | none       | `String`   |                                          |

### Virtual Host Commands

| Command Name        | Source File            | Parameters                                              | Returns        | Notes                     |
| ------------------- | ---------------------- | ------------------------------------------------------- | -------------- | ------------------------- |
| `list_vhosts`       | `commands/vhosts.rs`   | none                                                    | `VhostEntry[]` |                           |
| `add_vhost`         | `commands/vhosts.rs`   | `domain: String`, `root: String`, `php_version: String` | `String`       | Also writes vhosts.conf   |
| `remove_vhost`      | `commands/vhosts.rs`   | `domain: String`                                        | `String`       |                           |
| `toggle_vhost`      | `commands/vhosts.rs`   | `domain: String`, `enabled: bool`                       | `String`       |                           |
| `get_hosts_entries` | `commands/vhosts.rs`   | none                                                    | `HostEntry[]`  | Reads Windows hosts file  |
| `update_hosts_entry`| `commands/vhosts.rs`   | `domain: String`, `action: String`                      | `String`       | Requires elevation (UAC)  |

### Full Backup Commands

| Command Name          | Source File                | Parameters            | Returns         | Notes                                  |
| --------------------- | -------------------------- | --------------------- | --------------- | -------------------------------------- |
| `create_full_backup`  | `commands/fullbackup.rs`   | none                  | `BackupResult`  | Includes config/, www/, MySQL dump     |
| `list_full_backups`   | `commands/fullbackup.rs`   | none                  | `BackupEntry[]` | Sorted newest-first                    |
| `restore_full_backup` | `commands/fullbackup.rs`   | `backup_name: String` | `String`        | Path-traversal protected               |
| `delete_full_backup`  | `commands/fullbackup.rs`   | `backup_name: String` | `String`        | Validates path is inside backups/full/ |
| `open_backups_folder` | `commands/fullbackup.rs`   | none                  | `String`        | Opens Explorer at backups dir          |

---

## Shared Rust Types

These structs are serialized to JSON. TypeScript equivalents are in `src/types/`.

### `ServiceInfo` (Rust) = `ServiceStatus` (TypeScript)

```rust
#[derive(serde::Serialize)]
struct ServiceInfo {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    version: Option<String>,
}
```

### `PHPVersionInfo` (Rust) = `PHPVersion` (TypeScript)

```rust
#[derive(serde::Serialize)]
struct PHPVersionInfo {
    version: String,
    status: String,       // "installed" | "available" | "downloading"
    path: String,
    is_active: bool,
    installed: bool,
    download_url: String,
}
```

---

## Valid `service` Parameter Values

Many commands accept a `service: String` parameter. Valid values:

| Value                   | Maps to Config File                                    | Notes          |
| ----------------------- | ------------------------------------------------------ | -------------- |
| `"mysql"`               | `%LOCALAPPDATA%\DevStackBox\config\my.cnf`             |                |
| `"apache"` or `"httpd"` | `%LOCALAPPDATA%\DevStackBox\config\httpd.conf`         | Both accepted  |
| `"php"`                 | `%LOCALAPPDATA%\DevStackBox\config\php.ini`            |                |
| `"phpmyadmin"`          | `%LOCALAPPDATA%\DevStackBox\config\phpmyadmin.conf`    |                |

---

## Full `generate_handler!` Registration (lib.rs)

```rust
tauri::generate_handler![
    check_binaries,
    debug_paths,
    debug_installation,
    start_all_services,
    stop_all_services,
    test_apache_config,
    test_mysql_config,
    get_mysql_status,
    get_php_status,
    get_apache_status,
    start_mysql,
    stop_mysql,
    start_apache,
    stop_apache,
    get_php_versions,
    switch_php_version,
    download_php_version,
    list_php_extensions,
    toggle_php_extension,
    toggle_mysql,
    toggle_php,
    toggle_apache,
    backup_mysql_database,
    backup_mysql_database_named,
    list_mysql_databases,
    list_mysql_databases_detailed,
    restore_mysql_database,
    list_mysql_users,
    create_mysql_user,
    drop_mysql_user,
    set_mysql_user_password,
    open_php_terminal,
    get_service_logs,
    log_crash_event,
    read_config,
    update_config,
    backup_config,
    list_config_backups,
    restore_config_backup,
    create_directory_structure,
    get_autostart,
    set_autostart,
    get_system_info,
    show_main_window,
    hide_to_tray,
    set_tray_tooltip,
    quit_app,
    spawn_terminal,
    send_terminal_input,
    kill_terminal_session,
    analyze_security,
    get_ssl_status,
    generate_ssl_cert,
    enable_ssl,
    disable_ssl,
    list_vhosts,
    add_vhost,
    remove_vhost,
    toggle_vhost,
    get_hosts_entries,
    update_hosts_entry,
    create_full_backup,
    list_full_backups,
    restore_full_backup,
    delete_full_backup,
    open_backups_folder,
]
```

---

## Adding a New Command

1. Add the Rust function in the appropriate `commands/` module file:

   ```rust
   #[tauri::command]
   async fn my_new_command(param: String) -> Result<String, String> {
       Ok(format!("result: {}", param))
   }
   ```

2. Register it in `run()` inside `lib.rs` under `generate_handler!`.

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

5. Update this document with the new command entry.
