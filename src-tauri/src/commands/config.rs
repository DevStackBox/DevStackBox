// Config file commands (read, update, backup, restore).

use std::path::PathBuf;

use crate::utils::paths::{user_config_backups_dir, user_config_dir};

// Resolves the editable config file for a service.
//
// All four configs (mysql, apache, php, phpmyadmin) are managed in the user
// config dir (%LOCALAPPDATA%\devstackbox\config\). The PHP config in
// particular MUST be the user copy, because Apache loads php.ini from there
// via the PHPRC env var and the installation directory's php.ini is kept
// pristine. Earlier this pointed at php/current/php.ini in the install dir,
// which does not exist in the flat NSIS layout and is never the file PHP
// actually reads at runtime.
fn config_file_for(service: &str) -> Result<PathBuf, String> {
    let config_dir = user_config_dir();
    match service {
        "mysql" => Ok(config_dir.join("my.cnf")),
        "apache" | "httpd" => Ok(config_dir.join("httpd.conf")),
        "php" => Ok(config_dir.join("php.ini")),
        "phpmyadmin" => Ok(config_dir.join("phpmyadmin.conf")),
        _ => Err(format!("Unknown service: {}", service)),
    }
}

/// Ensure the managed config for a service exists and is migrated to the current version.
pub async fn ensure_service_config(service: &str) -> Result<(), String> {
    match service {
        "apache" | "httpd" => crate::commands::apache::ensure_apache_config().await,
        "mysql" => crate::commands::mysql::ensure_mysql_config().await,
        "php" => {
            crate::commands::php::patch_php_ini();
            Ok(())
        }
        "phpmyadmin" => Ok(()),
        _ => Err(format!("Unknown service: {}", service)),
    }
}

#[tauri::command]
pub async fn read_config(service: String) -> Result<String, String> {
    ensure_service_config(&service).await?;
    let config_file = config_file_for(&service)?;

    if !config_file.exists() {
        return Err(format!("Config file not found: {}", config_file.display()));
    }

    std::fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config file: {}", e))
}

#[tauri::command]
pub async fn update_config(service: String, content: String) -> Result<String, String> {
    let _site_guard = super::ssl::SITE_LOCK.lock().await;
    let _process_lock = super::ssl::lock_configuration()?;
    ensure_service_config(&service).await?;
    let config_file = config_file_for(&service)?;

    let staged = config_file.with_extension(format!("{}.pending", unique_stamp()?));
    std::fs::write(&staged, &content).map_err(|e| e.to_string())?;
    let result = validate_file(&service, &staged).and_then(|_| {
        if config_file.exists() { snapshot(&config_file)?; }
        std::fs::rename(&staged, &config_file).map_err(|e| format!("Cannot replace configuration: {e}"))
    });
    let _ = std::fs::remove_file(&staged);
    result?;

    Ok(format!("Config updated successfully: {}", config_file.display()))
}

#[tauri::command]
pub async fn backup_config(service: String) -> Result<String, String> {
    ensure_service_config(&service).await?;
    let config_file = config_file_for(&service)?;
    let path = snapshot(&config_file)?;
    Ok(format!("Backup created: {}", path.display()))
}

#[tauri::command]
pub async fn list_config_backups(service: String) -> Result<Vec<String>, String> {
    let backup_dir = user_config_backups_dir();

    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let config_prefix = match service.as_str() {
        "mysql" => "my.cnf",
        "apache" | "httpd" => "httpd.conf",
        "php" => "php.ini",
        "phpmyadmin" => "phpmyadmin.conf",
        _ => return Err(format!("Unknown service: {}", service)),
    };

    let mut backups = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&backup_dir) {
        for entry in entries.flatten() {
            if let Some(filename) = entry.file_name().to_str() {
                if filename.starts_with(config_prefix) {
                    backups.push(filename.to_string());
                }
            }
        }
    }

    backups.sort_by(|a, b| b.cmp(a)); // Most recent first
    Ok(backups)
}

#[tauri::command]
pub async fn restore_config_backup(
    service: String,
    backup_name: String,
) -> Result<String, String> {
    let backup_dir = user_config_backups_dir();
    let config_file = config_file_for(&service)?;

    let prefix = format!("{}_", config_file.file_name().unwrap().to_string_lossy());
    if !valid_backup_name(&backup_name, &prefix) { return Err("Invalid configuration backup".into()); }
    let base = std::fs::canonicalize(&backup_dir).map_err(|e| e.to_string())?;
    let backup_path = std::fs::canonicalize(backup_dir.join(&backup_name)).map_err(|e| e.to_string())?;
    if !backup_path.starts_with(base) { return Err("Backup is outside the backup folder".into()); }
    let content = std::fs::read_to_string(backup_path).map_err(|e| e.to_string())?;
    update_config(service, content).await?;
    Ok(format!("Configuration restored from {backup_name}. Restart the service to apply."))
}

fn valid_backup_name(name: &str, prefix: &str) -> bool {
    name.starts_with(prefix) && name.ends_with(".bak") && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

fn unique_stamp() -> Result<u128, String> {
    Ok(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos())
}

fn snapshot(path: &std::path::Path) -> Result<PathBuf, String> {
    let name = path.file_name().ok_or("Invalid configuration path")?.to_string_lossy();
    let target = user_config_backups_dir().join(format!("{name}_{}.bak", unique_stamp()?));
    std::fs::copy(path, &target).map_err(|e| format!("Cannot back up configuration: {e}"))?;
    Ok(target)
}

fn validate_file(service: &str, path: &std::path::Path) -> Result<(), String> {
    use crate::utils::paths::{get_installation_path, get_apache_exe, get_mysqld_exe, active_php_dir};
    use crate::utils::process::create_hidden_command;
    let root = get_installation_path();
    let mut cmd = match service {
        "apache" | "httpd" => {
            let mut cmd = create_hidden_command(&get_apache_exe(&root).to_string_lossy());
            cmd.arg("-t").arg("-f").arg(path); cmd
        }
        "mysql" => {
            let mut cmd = create_hidden_command(&get_mysqld_exe(&root).to_string_lossy());
            cmd.arg(format!("--defaults-file={}", path.display())).arg("--validate-config"); cmd
        }
        "php" => {
            let mut cmd = create_hidden_command(&active_php_dir().join("php.exe").to_string_lossy());
            cmd.arg("-c").arg(path).args(["-r", "echo 'Configuration checked';"]); cmd
        }
        _ => return Err("This configuration cannot be validated independently.".into()),
    };
    let output = cmd.output().map_err(|e| format!("Cannot validate configuration: {e}"))?;
    let errors = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() || (service == "php" && !errors.trim().is_empty()) {
        return Err(format!("Configuration was not saved. {} {}", errors.trim(), String::from_utf8_lossy(&output.stdout).trim()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_untrusted_backup_names() {
        assert!(valid_backup_name("php.ini_123.bak", "php.ini_"));
        for name in ["../php.ini_123.bak", "C:\\php.ini_123.bak", "httpd.conf_123.bak", "php.ini_../x.bak"] {
            assert!(!valid_backup_name(name, "php.ini_"));
        }
    }
}
