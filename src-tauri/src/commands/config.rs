// Config file commands (read, update, backup, restore).

use crate::utils::paths::{get_installation_path, user_config_backups_dir, user_config_dir};

#[tauri::command]
pub async fn read_config(service: String) -> Result<String, String> {
    let base_path = get_installation_path();
    let config_dir = user_config_dir();

    let config_file = match service.as_str() {
        "mysql" => config_dir.join("my.cnf"),
        "apache" | "httpd" => config_dir.join("httpd.conf"),
        "php" => base_path.join("php").join("current").join("php.ini"),
        "phpmyadmin" => config_dir.join("phpmyadmin.conf"),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    if !config_file.exists() {
        return Err(format!("Config file not found: {}", config_file.display()));
    }

    std::fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config file: {}", e))
}

#[tauri::command]
pub async fn update_config(service: String, content: String) -> Result<String, String> {
    let base_path = get_installation_path();
    let config_dir = user_config_dir();

    let config_file = match service.as_str() {
        "mysql" => config_dir.join("my.cnf"),
        "apache" | "httpd" => config_dir.join("httpd.conf"),
        "php" => base_path.join("php").join("current").join("php.ini"),
        "phpmyadmin" => config_dir.join("phpmyadmin.conf"),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    if config_file.exists() {
        let backup_dir = user_config_backups_dir();

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let backup_name = format!(
            "{}_{}.bak",
            config_file.file_name().unwrap().to_str().unwrap(),
            timestamp
        );
        let backup_path = backup_dir.join(backup_name);

        std::fs::copy(&config_file, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    std::fs::write(&config_file, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(format!("Config updated successfully: {}", config_file.display()))
}

#[tauri::command]
pub async fn backup_config(service: String) -> Result<String, String> {
    let base_path = get_installation_path();
    let config_dir = user_config_dir();
    let backup_dir = user_config_backups_dir();

    let config_file = match service.as_str() {
        "mysql" => config_dir.join("my.cnf"),
        "apache" | "httpd" => config_dir.join("httpd.conf"),
        "php" => base_path.join("php").join("current").join("php.ini"),
        "phpmyadmin" => config_dir.join("phpmyadmin.conf"),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    if !config_file.exists() {
        return Err(format!("Config file not found: {}", config_file.display()));
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let backup_name = format!(
        "{}_{}.bak",
        config_file.file_name().unwrap().to_str().unwrap(),
        timestamp
    );
    let backup_path = backup_dir.join(backup_name);

    std::fs::copy(&config_file, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    Ok(format!("Backup created: {}", backup_path.display()))
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
    let base_path = get_installation_path();
    let config_dir = user_config_dir();
    let backup_dir = user_config_backups_dir();

    let config_file = match service.as_str() {
        "mysql" => config_dir.join("my.cnf"),
        "apache" | "httpd" => config_dir.join("httpd.conf"),
        "php" => base_path.join("php").join("current").join("php.ini"),
        "phpmyadmin" => config_dir.join("phpmyadmin.conf"),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    let backup_path = backup_dir.join(&backup_name);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_name));
    }

    std::fs::copy(&backup_path, &config_file)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    Ok(format!("Config restored from: {}", backup_name))
}
