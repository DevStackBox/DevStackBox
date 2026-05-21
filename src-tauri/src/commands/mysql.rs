// MySQL service commands.

use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::ServiceInfo;
use crate::utils::paths::{get_installation_path, user_config_dir, user_mysql_data_dir};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, get_process_pid, is_process_running,
};

#[tauri::command]
pub async fn get_mysql_status() -> Result<ServiceInfo, String> {
    let running = is_process_running("mysqld.exe");

    let pid = if running {
        get_process_pid("mysqld.exe")
    } else {
        None
    };

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
    let mysql_bin_path = base_path.join("mysql").join("bin").join("mysqld.exe");

    let mysql_dir = data_dir.join("mysql");
    if !mysql_dir.exists() {
        match Command::new(&mysql_bin_path)
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

    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
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

            match std::process::Command::new("netstat").arg("-ano").output() {
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
    if !is_process_running("mysqld.exe") {
        return Err("MySQL is not running".to_string());
    }

    match Command::new("taskkill")
        .args(["/F", "/IM", "mysqld.exe"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            std::thread::sleep(Duration::from_millis(1000));

            if !is_process_running("mysqld.exe") {
                Ok(true)
            } else {
                Err(format!(
                    "MySQL process still running after kill attempt.\nOutput: {}\nError: {}",
                    stdout, stderr
                ))
            }
        }
        Err(e) => Err(format!("Failed to execute taskkill: {}", e)),
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
    let base_path = crate::utils::paths::get_project_root().ok()?;
    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");

    if !mysql_path.exists() {
        return None;
    }

    match Command::new(&mysql_path).arg("--version").output() {
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
    let mysql_dump_path = base_path.join("mysql").join("bin").join("mysqldump.exe");

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

    let output = Command::new(&mysql_dump_path)
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
    let mysql_path = base_path.join("mysql").join("bin").join("mysql.exe");

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
    let mysql_dump_path = base_path.join("mysql").join("bin").join("mysqldump.exe");

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
    let mysql_path = base_path.join("mysql").join("bin").join("mysql.exe");

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
