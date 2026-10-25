// MySQL service commands.

use serde_json;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::ServiceInfo;
use crate::utils::config_ports::mysql_port;
use crate::utils::config_version::needs_config_migration;
use crate::utils::mysql_connection::{
    mysqldump_command, mysql_command, mysqladmin_command, prepare_mysql_client,
};
use crate::utils::mysql_credentials::write_stored_root_password;
use crate::utils::mysql_sql::{escape_mysql_string_literal, quote_mysql_user_host, validate_mysql_host};
use crate::utils::paths::{get_installation_path, get_mysqld_exe, to_apache_path, user_config_dir, user_logs_dir, user_mysql_data_dir};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, find_our_processes, is_our_process_running,
    kill_pid,
};

pub const MYSQL_CONFIG_VERSION: u32 = 2;

fn mysqld_exe_path() -> std::path::PathBuf {
    let base = get_installation_path();
    get_mysqld_exe(&base)
}

fn is_port_listening(port: u16) -> bool {
    match create_hidden_command("netstat").arg("-ano").output() {
        Ok(netstat_output) => {
            let needle = format!(":{} ", port);
            String::from_utf8_lossy(&netstat_output.stdout).contains(&needle)
        }
        Err(_) => false,
    }
}

async fn wait_for_mysql_port(max_wait: Duration) -> Result<(), String> {
    let port = mysql_port();
    let step = Duration::from_millis(500);
    let mut elapsed = Duration::ZERO;
    while elapsed < max_wait {
        if is_port_listening(port) {
            return Ok(());
        }
        sleep(step).await;
        elapsed += step;
    }
    Err(format!(
        "MySQL started but port {} is not listening",
        port
    ))
}

#[tauri::command]
pub async fn get_mysql_status() -> Result<ServiceInfo, String> {
    let exe = mysqld_exe_path();
    let our_pids = find_our_processes("mysqld.exe", &exe);
    let running = !our_pids.is_empty();
    let pid = our_pids.first().copied();

    Ok(ServiceInfo {
        running,
        pid,
        port: Some(mysql_port()),
        version: get_mysql_version().await,
    })
}

async fn initialize_mysql_data() -> Result<(), String> {
    let base_path = get_installation_path();

    let data_dir = user_mysql_data_dir();
    let mysql_bin_path = get_mysqld_exe(&base_path);

    let mysql_dir = data_dir.join("mysql");
    if !mysql_dir.exists() {
        match create_hidden_command(&mysql_bin_path.to_string_lossy())
            .arg("--initialize-insecure")
            .arg(format!("--basedir={}", base_path.join("mysql").display()))
            .arg(format!("--datadir={}", data_dir.display()))
            .output()
        {
            Ok(output) if output.status.success() => {
                println!("MySQL data directory initialized successfully");
                Ok(())
            }
            Ok(output) => Err(format!("MySQL initialization failed: {}", String::from_utf8_lossy(&output.stderr))),
            Err(e) => Err(format!("Failed to initialize MySQL data directory: {}", e)),
        }
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn start_mysql() -> Result<bool, String> {
    let base_path = get_installation_path();

    let mysql_path = get_mysqld_exe(&base_path);
    if !mysql_path.exists() {
        return Err(format!(
            "MySQL binary not found at {}. Please ensure MySQL is installed.",
            mysql_path.display()
        ));
    }

    if is_our_process_running("mysqld.exe", &mysql_path) { return Ok(true); }
    let config_path = user_config_dir().join("my.cnf");
    ensure_mysql_config().await?;

    initialize_mysql_data().await?;

    let port = mysql_port();
    ensure_port_available(port, "MySQL")?;

    match create_hidden_command(&mysql_path.to_string_lossy())
        .arg(format!("--defaults-file={}", config_path.display()))
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("MySQL started with PID: {}", pid);
            wait_for_mysql_port(Duration::from_secs(15)).await?;
            prepare_mysql_client()?;
            let _ = pid;
            Ok(true)
        }
        Err(e) => Err(format!("Failed to start MySQL: {}", e)),
    }
}

#[tauri::command]
pub async fn stop_mysql() -> Result<bool, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock().map_err(|_| "A database operation is running. Cancel it or wait before stopping MySQL.")?;
    let mysql_path = mysqld_exe_path();

    if !is_our_process_running("mysqld.exe", &mysql_path) {
        return Ok(true);
    }

    if let Ok(mut admin) = crate::utils::mysql_connection::verify_mysql_datadir().and_then(|_| mysqladmin_command()) {
        let _ = admin.arg("shutdown").output();
        for _ in 0..20 {
            if find_our_processes("mysqld.exe", &mysql_path).is_empty() {
                return Ok(true);
            }
            sleep(Duration::from_millis(500)).await;
        }
    }

    let mut errors: Vec<String> = Vec::new();
    for attempt in 0..4 {
        let pids = find_our_processes("mysqld.exe", &mysql_path);
        if pids.is_empty() {
            return Ok(true);
        }
        for pid in pids {
            if let Err(e) = kill_pid(pid) {
                errors.push(e);
            }
        }
        sleep(Duration::from_millis(if attempt == 0 { 1000 } else { 500 })).await;
    }

    if find_our_processes("mysqld.exe", &mysql_path).is_empty() {
        Ok(true)
    } else {
        Err(format!(
            "DevStackBox MySQL process still running after shutdown attempts. Errors: {}",
            errors.join("; ")
        ))
    }
}

pub async fn ensure_mysql_config() -> Result<(), String> {
    let config_path = user_config_dir().join("my.cnf");
    if !config_path.exists() {
        return create_default_mysql_config().await;
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read MySQL config: {}", e))?;
    if needs_config_migration(&content, MYSQL_CONFIG_VERSION) {
        println!(
            "Detected outdated MySQL config. Migrating to configVersion {}...",
            MYSQL_CONFIG_VERSION
        );
        create_default_mysql_config().await?;
        return Ok(());
    }
    ensure_mysql_error_log(&config_path)?;
    Ok(())
}

fn ensure_mysql_error_log(config_path: &std::path::Path) -> Result<(), String> {
    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read MySQL config: {e}"))?;
    let has_log_setting = content.lines().any(|line| {
        let line = line.trim();
        !line.starts_with('#') && !line.starts_with(';')
            && line.split_once('=').is_some_and(|(key, _)| key.trim().eq_ignore_ascii_case("log-error"))
    });
    if has_log_setting { return Ok(()); }

    let log_path = to_apache_path(&user_logs_dir().join("mysql.log"));
    let directive = format!("log-error=\"{log_path}\"");
    let mut lines: Vec<String> = content.lines().map(str::to_owned).collect();
    if let Some(section) = lines.iter().position(|line| line.trim().eq_ignore_ascii_case("[mysqld]")) {
        lines.insert(section + 1, directive);
    } else {
        lines.push("[mysqld]".into());
        lines.push(directive);
    }
    let mut updated = lines.join("\n");
    if content.ends_with('\n') { updated.push('\n'); }
    std::fs::write(config_path, updated)
        .map_err(|e| format!("Failed to configure MySQL error log: {e}"))
}

pub async fn create_default_mysql_config() -> Result<(), String> {
    let install_path = get_installation_path();

    let mysql_base = install_path.join("mysql");
    let mysql_data = user_mysql_data_dir();

    let config_content = format!(
        r#"# configVersion: 2
# Managed by DevStackBox. Edits to this file are preserved across upgrades
# unless the configVersion is bumped, which triggers a migration.
[mysqld]
port=3306
basedir={}
datadir={}
default-storage-engine=InnoDB
sql-mode="STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
max_connections=100
table_open_cache=2000
tmp_table_size=16M
thread_cache_size=10
key_buffer_size=8M
sort_buffer_size=256K
skip-networking=false
bind-address=127.0.0.1
log-error="{}"

[mysql]
default-character-set=utf8mb4

[client]
host=127.0.0.1
protocol=TCP
port=3306
default-character-set=utf8mb4
"#,
        mysql_base.display().to_string().replace("\\", "/"),
        mysql_data.display().to_string().replace("\\", "/"),
        to_apache_path(&user_logs_dir().join("mysql.log"))
    );

    let config_dir = user_config_dir();
    std::fs::write(config_dir.join("my.cnf"), config_content).map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_mysql_version() -> Option<String> {
    let base_path = get_installation_path();
    let mysql_path = get_mysqld_exe(&base_path);

    if !mysql_path.exists() {
        return None;
    }

    match create_hidden_command(&mysql_path.to_string_lossy()).arg("--version").output() {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            if let Some(start) = version_str.find("Ver ") {
                if let Some(end) = version_str[start + 4..].find(" ") {
                    return Some(version_str[start + 4..start + 4 + end].to_string());
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[tauri::command]
pub async fn toggle_mysql() -> Result<bool, String> {
    let status = get_mysql_status().await?;
    if status.running {
        stop_mysql().await?;
        Ok(false)
    } else {
        start_mysql().await?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn backup_mysql_database() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock().map_err(|_| "Another database operation is in progress.")?;
    prepare_mysql_client()?;

    let backups_dir = crate::utils::paths::user_backups_dir().join("mysql");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate backup timestamp: {}", e))?
        .as_nanos();

    let backup_file = backups_dir.join(format!("mysql_backup_{}.sql", timestamp));

    stream_mysqldump_to_file(&["--all-databases"], &backup_file)?;

    Ok(format!("MySQL backup created: {}", backup_file.display()))
    }).await.map_err(|e| e.to_string())?
}

/// List all non-system databases on the running MySQL server.
#[tauri::command]
pub async fn list_mysql_databases() -> Result<Vec<String>, String> {
    prepare_mysql_client()?;

    let output = mysql_command()?
        .args(["-N", "-B", "-e", "SHOW DATABASES"])
        .output()
        .map_err(|e| format!("Failed to execute mysql client: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("mysql query failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let system = ["information_schema", "performance_schema", "mysql", "sys"];
    let dbs: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !system.contains(&s.as_str()))
        .collect();

    Ok(dbs)
}

/// Same as `list_mysql_databases` but also returns table count + total size
/// (data + index bytes) per schema via a single `information_schema.tables`
/// query. Used by the Databases page row UI.
#[tauri::command]
pub async fn list_mysql_databases_detailed() -> Result<Vec<crate::types::DatabaseInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let raw = run_mysql_query("SELECT s.SCHEMA_NAME, SUM(CASE WHEN t.TABLE_TYPE='BASE TABLE' THEN 1 ELSE 0 END), COALESCE(SUM(t.DATA_LENGTH+t.INDEX_LENGTH),0), SUM(CASE WHEN t.TABLE_TYPE='VIEW' THEN 1 ELSE 0 END) FROM information_schema.schemata s LEFT JOIN information_schema.tables t ON s.SCHEMA_NAME=t.TABLE_SCHEMA WHERE s.SCHEMA_NAME NOT IN ('mysql','sys','information_schema','performance_schema') GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME;")?;
        raw.lines().map(|line| {
            let parts: Vec<_> = line.split('\t').collect();
            if parts.len() != 4 { return Err("Invalid database metadata response".to_string()); }
            Ok(crate::types::DatabaseInfo { name: parts[0].into(), table_count: parts[1].parse().map_err(|_| "Invalid table count")?, size_bytes: parts[2].parse().map_err(|_| "Invalid database size")?, view_count: parts[3].parse().map_err(|_| "Invalid view count")? })
        }).collect()
    }).await.map_err(|e| e.to_string())?
}

/// Back up a single MySQL database to `<user_data>/backups/mysql/<db>_<timestamp>.sql`.
#[tauri::command]
pub async fn backup_mysql_database_named(database: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock().map_err(|_| "Another database operation is in progress.")?;
    if database.trim().is_empty() {
        return Err("Database name is required".to_string());
    }
    if database.contains(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-') {
        return Err("Invalid database name".to_string());
    }

    prepare_mysql_client()?;

    let backups_dir = crate::utils::paths::user_backups_dir().join("mysql");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate backup timestamp: {}", e))?
        .as_nanos();

    let backup_file = backups_dir.join(format!("{}_{}.sql", database, timestamp));

    stream_mysqldump_to_file(&["--databases", &database], &backup_file)?;

    Ok(format!("Backup created: {}", backup_file.display()))
    }).await.map_err(|e| e.to_string())?
}

pub(crate) fn stream_mysqldump_to_file(args: &[&str], backup_file: &std::path::Path) -> Result<(), String> {
    let mut command = mysqldump_command()?;
    command.args(["--routines", "--events", "--triggers", "--hex-blob"]);
    command.args(args);
    crate::utils::database_io::dump(command, backup_file)
}

pub(crate) fn run_mysql_query(query: &str) -> Result<String, String> {
    prepare_mysql_client()?;
    crate::utils::database_io::query(mysql_command()?, query)
}

#[tauri::command]
pub async fn list_mysql_users() -> Result<Vec<serde_json::Value>, String> {
    let raw = run_mysql_query(
        "SELECT User, Host, IF(authentication_string != '', 'Yes', 'No') AS has_password \
         FROM mysql.user ORDER BY User, Host;",
    )?;

    let users = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let cols: Vec<&str> = line.splitn(3, '\t').collect();
            serde_json::json!({
                "user": cols.first().unwrap_or(&""),
                "host": cols.get(1).unwrap_or(&""),
                "has_password": cols.get(2).unwrap_or(&"No") == &"Yes"
            })
        })
        .collect();

    Ok(users)
}

#[tauri::command]
pub async fn create_mysql_user(
    username: String,
    host: String,
    password: String,
) -> Result<String, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    let user_host = quote_mysql_user_host(&username, &host)?;

    let query = if password.is_empty() {
        format!("CREATE USER {user_host};")
    } else {
        let pwd = escape_mysql_string_literal(&password);
        format!("CREATE USER {user_host} IDENTIFIED BY '{pwd}';")
    };

    run_mysql_query(&query)?;
    Ok(format!("User '{}' created", username.trim()))
}

#[tauri::command]
pub async fn drop_mysql_user(username: String, host: String) -> Result<String, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    ensure_deletable_account(&username)?;
    let user_host = quote_mysql_user_host(&username, &host)?;
    let query = format!("DROP USER IF EXISTS {user_host};");
    run_mysql_query(&query)?;
    Ok(format!("User '{}' dropped", username.trim()))
}

#[tauri::command]
pub async fn set_mysql_user_password(
    username: String,
    host: String,
    password: String,
) -> Result<String, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    let user_host = quote_mysql_user_host(&username, &host)?;
    let host_norm = validate_mysql_host(&host)?;

    let query = if password.is_empty() {
        format!("ALTER USER {user_host} IDENTIFIED BY '';")
    } else {
        let pwd = escape_mysql_string_literal(&password);
        format!("ALTER USER {user_host} IDENTIFIED BY '{pwd}';")
    };

    run_mysql_query(&query)?;

    if username.trim() == "root"
        && (host_norm == "localhost" || host_norm == "127.0.0.1" || host.trim().is_empty())
    {
        let stored = if password.is_empty() {
            None
        } else {
            Some(password)
        };
        write_stored_root_password(stored).map_err(|_| "The server password changed, but DevStackBox could not save its credential. Update the saved credential before reconnecting.".to_string())?;
    }

    Ok(format!("Password updated for '{}'", username.trim()))
}

pub(crate) fn validate_database_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Database name is required".to_string());
    }
    if name.len() > 64 {
        return Err("Database name is too long".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid database name".to_string());
    }
    Ok(name.to_string())
}

#[tauri::command]
pub async fn create_mysql_database(name: String) -> Result<String, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    let name = validate_database_name(&name)?;
    ensure_user_database(&name)?;
    prepare_mysql_client()?;
    let escaped = name.replace('`', "``");
    let query = format!("CREATE DATABASE `{escaped}`;");
    run_mysql_query(&query)?;
    Ok(format!("Database '{}' created", name))
}

#[tauri::command]
pub async fn drop_mysql_database(name: String) -> Result<String, String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK
        .try_lock()
        .map_err(|_| "Another database import or maintenance operation is in progress.")?;
    let name = validate_database_name(&name)?;
    ensure_user_database(&name)?;
    prepare_mysql_client()?;
    let escaped = name.replace('`', "``");
    let query = format!("DROP DATABASE `{escaped}`;");
    run_mysql_query(&query)?;
    Ok(format!("Database '{}' dropped", name))
}

pub(crate) fn ensure_user_database(name: &str) -> Result<(), String> {
    if ["mysql", "sys", "information_schema", "performance_schema"].contains(&name.trim().to_ascii_lowercase().as_str()) {
        return Err("System databases are protected from this operation.".into());
    }
    Ok(())
}
fn ensure_deletable_account(name: &str) -> Result<(), String> {
    if name.trim().eq_ignore_ascii_case("root") || name.trim().to_ascii_lowercase().starts_with("mysql.") {
        return Err("The administrative and MySQL system accounts cannot be deleted.".into());
    }
    Ok(())
}
#[cfg(test)]
mod workspace_protection_tests {
    use super::*;
    #[test]
    fn system_schemas_are_protected_case_insensitively() {
        for name in ["mysql", "MYSQL", " sys ", "information_schema", "performance_schema"] { assert!(ensure_user_database(name).is_err()); }
        assert!(ensure_user_database("mysql_project").is_ok());
    }
    #[test]
    fn administrative_identities_are_protected() {
        for name in ["root", "mysql.sys", "mysql.session", "mysql.infoschema"] { assert!(ensure_deletable_account(name).is_err()); }
        assert!(ensure_deletable_account("app_user").is_ok());
    }
}
