// MySQL service commands.

use serde_json;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::ServiceInfo;
use crate::utils::paths::{get_installation_path, get_mysql_client_exe, get_mysqld_exe, get_mysqldump_exe, user_config_dir, user_mysql_data_dir};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, find_our_processes, is_our_process_running,
    kill_pid,
};

fn mysqld_exe_path() -> std::path::PathBuf {
    let base = get_installation_path();
    get_mysqld_exe(&base)
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
        port: Some(3306),
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
            Ok(_) => {
                println!("MySQL data directory initialized successfully");
                Ok(())
            }
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

    let config_path = user_config_dir().join("my.cnf");
    if !config_path.exists() {
        create_default_mysql_config().await?;
    }

    initialize_mysql_data().await?;

    // Phase 5.2 - fail fast with a clear message if port 3306 is taken
    // (commonly another MySQL install or a previous DevStackBox run).
    ensure_port_available(3306, "MySQL")?;

    match create_hidden_command(&mysql_path.to_string_lossy())
        .arg(format!("--defaults-file={}", config_path.display()))
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("MySQL started with PID: {}", pid);

            sleep(Duration::from_secs(2)).await;

            match create_hidden_command("netstat").arg("-ano").output() {
                Ok(netstat_output) => {
                    let output_str = String::from_utf8_lossy(&netstat_output.stdout);
                    if output_str.contains(":3306 ") {
                        let _ = pid;
                        Ok(true)
                    } else {
                        Err("MySQL started but port 3306 is not listening".to_string())
                    }
                }
                Err(_) => Err("Failed to verify MySQL is running".to_string()),
            }
        }
        Err(e) => Err(format!("Failed to start MySQL: {}", e)),
    }
}

#[tauri::command]
pub async fn stop_mysql() -> Result<bool, String> {
    let mysql_path = mysqld_exe_path();

    if !is_our_process_running("mysqld.exe", &mysql_path) {
        return Err("DevStackBox MySQL is not running".to_string());
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
        std::thread::sleep(Duration::from_millis(if attempt == 0 { 1000 } else { 500 }));
    }

    if find_our_processes("mysqld.exe", &mysql_path).is_empty() {
        Ok(true)
    } else {
        Err(format!(
            "DevStackBox MySQL process still running after kill attempts. Errors: {}",
            errors.join("; ")
        ))
    }
}

async fn create_default_mysql_config() -> Result<(), String> {
    let install_path = get_installation_path();

    let mysql_base = install_path.join("mysql");
    let mysql_data = user_mysql_data_dir();

    let config_content = format!(
        r#"# configVersion: 1
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

[mysql]
default-character-set=utf8mb4

[client]
port=3306
default-character-set=utf8mb4
"#,
        mysql_base.display().to_string().replace("\\", "/"),
        mysql_data.display().to_string().replace("\\", "/")
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
    let base_path = get_installation_path();
    let mysql_dump_path = get_mysqldump_exe(&base_path);

    if !mysql_dump_path.exists() {
        return Err(format!(
            "mysqldump not found at {}",
            mysql_dump_path.display()
        ));
    }

    let backups_dir = crate::utils::paths::user_backups_dir().join("mysql");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate backup timestamp: {}", e))?
        .as_secs();

    let backup_file = backups_dir.join(format!("mysql_backup_{}.sql", timestamp));

    let output = create_hidden_command(&mysql_dump_path.to_string_lossy())
        .args(["-u", "root", "--all-databases"])
        .output()
        .map_err(|e| format!("Failed to execute mysqldump: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("mysqldump failed: {}", stderr.trim()));
    }

    std::fs::write(&backup_file, output.stdout)
        .map_err(|e| format!("Failed to write backup file: {}", e))?;

    Ok(format!("MySQL backup created: {}", backup_file.display()))
}

/// List all non-system databases on the running MySQL server.
#[tauri::command]
pub async fn list_mysql_databases() -> Result<Vec<String>, String> {
    let base_path = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base_path);

    if !mysql_path.exists() {
        return Err(format!("mysql not found at {}", mysql_path.display()));
    }

    let output = create_hidden_command(&mysql_path.to_string_lossy())
        .args([
            "-u",
            "root",
            "-N",
            "-B",
            "-e",
            "SHOW DATABASES",
        ])
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
    let base_path = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base_path);

    if !mysql_path.exists() {
        return Err(format!("mysql not found at {}", mysql_path.display()));
    }

    // Excluding system schemas at SQL level keeps the result tight.
    let sql = "SELECT table_schema, COUNT(*), \
        IFNULL(SUM(data_length + index_length), 0) \
        FROM information_schema.tables \
        WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys') \
        GROUP BY table_schema";

    let output = create_hidden_command(&mysql_path.to_string_lossy())
        .args(["-u", "root", "-N", "-B", "-e", sql])
        .output()
        .map_err(|e| format!("Failed to execute mysql client: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("mysql query failed: {}", stderr.trim()));
    }

    // Some user databases may exist with zero tables. They are not returned
    // by the GROUP BY above, so fold them in via the plain SHOW DATABASES
    // result with zeroed metrics.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut detailed: std::collections::HashMap<String, (u64, u64)> =
        std::collections::HashMap::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() != 3 {
            continue;
        }
        let name = parts[0].trim().to_string();
        let table_count: u64 = parts[1].trim().parse().unwrap_or(0);
        let size_bytes: u64 = parts[2].trim().parse().unwrap_or(0);
        detailed.insert(name, (table_count, size_bytes));
    }

    let all_names = list_mysql_databases().await?;
    let mut result: Vec<crate::types::DatabaseInfo> = all_names
        .into_iter()
        .map(|name| {
            let (table_count, size_bytes) = detailed.remove(&name).unwrap_or((0, 0));
            crate::types::DatabaseInfo {
                name,
                table_count,
                size_bytes,
            }
        })
        .collect();
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

/// Back up a single MySQL database to `<user_data>/backups/mysql/<db>_<timestamp>.sql`.
#[tauri::command]
pub async fn backup_mysql_database_named(database: String) -> Result<String, String> {
    if database.trim().is_empty() {
        return Err("Database name is required".to_string());
    }
    if database.contains(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-') {
        return Err("Invalid database name".to_string());
    }

    let base_path = get_installation_path();
    let mysql_dump_path = get_mysqldump_exe(&base_path);

    if !mysql_dump_path.exists() {
        return Err(format!(
            "mysqldump not found at {}",
            mysql_dump_path.display()
        ));
    }

    let backups_dir = crate::utils::paths::user_backups_dir().join("mysql");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to generate backup timestamp: {}", e))?
        .as_secs();

    let backup_file = backups_dir.join(format!("{}_{}.sql", database, timestamp));

    let output = create_hidden_command(&mysql_dump_path.to_string_lossy())
        .args(["-u", "root", "--databases", &database])
        .output()
        .map_err(|e| format!("Failed to execute mysqldump: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("mysqldump failed: {}", stderr.trim()));
    }

    std::fs::write(&backup_file, output.stdout)
        .map_err(|e| format!("Failed to write backup file: {}", e))?;

    Ok(format!("Backup created: {}", backup_file.display()))
}

/// Restore a `.sql` dump into the MySQL server. The frontend should read the
/// file with FileReader and pass the SQL text directly so we don't need the
/// dialog plugin.
#[tauri::command]
pub async fn restore_mysql_database(sql: String) -> Result<String, String> {
    if sql.trim().is_empty() {
        return Err("SQL content is empty".to_string());
    }

    let base_path = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base_path);

    if !mysql_path.exists() {
        return Err(format!("mysql not found at {}", mysql_path.display()));
    }

    use std::io::Write;
    use std::process::Stdio;

    let mut child = create_hidden_command(&mysql_path.to_string_lossy())
        .args(["-u", "root"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn mysql client: {}", e))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(sql.as_bytes())
            .map_err(|e| format!("Failed to pipe SQL to mysql: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for mysql client: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("mysql restore failed: {}", stderr.trim()));
    }

    let bytes = sql.len();
    Ok(format!("Restored {} bytes of SQL", bytes))
}

// ── MySQL user management ────────────────────────────────────────────────────

fn run_mysql_query(query: &str) -> Result<String, String> {
    let base_path = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base_path);

    if !mysql_path.exists() {
        return Err(format!("mysql not found at {}", mysql_path.display()));
    }

    let output = create_hidden_command(&mysql_path.to_string_lossy())
        .args(["-u", "root", "--batch", "--skip-column-names", "-e", query])
        .output()
        .map_err(|e| format!("Failed to run mysql query: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
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
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    let host = if host.is_empty() {
        "localhost".to_string()
    } else {
        host
    };

    let query = if password.is_empty() {
        format!(
            "CREATE USER '{}'@'{}'; FLUSH PRIVILEGES;",
            username.replace('\'', "\\'"),
            host.replace('\'', "\\'")
        )
    } else {
        format!(
            "CREATE USER '{}'@'{}' IDENTIFIED BY '{}'; FLUSH PRIVILEGES;",
            username.replace('\'', "\\'"),
            host.replace('\'', "\\'"),
            password.replace('\'', "\\'")
        )
    };

    run_mysql_query(&query)?;
    Ok(format!("User '{}' created", username))
}

#[tauri::command]
pub async fn drop_mysql_user(username: String, host: String) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    let query = format!(
        "DROP USER IF EXISTS '{}'@'{}'; FLUSH PRIVILEGES;",
        username.replace('\'', "\\'"),
        host.replace('\'', "\\'")
    );

    run_mysql_query(&query)?;
    Ok(format!("User '{}' dropped", username))
}

#[tauri::command]
pub async fn set_mysql_user_password(
    username: String,
    host: String,
    password: String,
) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    let query = if password.is_empty() {
        format!(
            "ALTER USER '{}'@'{}' IDENTIFIED BY ''; FLUSH PRIVILEGES;",
            username.replace('\'', "\\'"),
            host.replace('\'', "\\'")
        )
    } else {
        format!(
            "ALTER USER '{}'@'{}' IDENTIFIED BY '{}'; FLUSH PRIVILEGES;",
            username.replace('\'', "\\'"),
            host.replace('\'', "\\'"),
            password.replace('\'', "\\'")
        )
    };

    run_mysql_query(&query)?;
    Ok(format!("Password updated for '{}'", username))
}
