// PHP commands.

use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::{PHPVersionInfo, ServiceInfo};
use crate::utils::paths::{get_installation_path, user_config_dir};

#[tauri::command]
pub async fn get_php_status() -> Result<ServiceInfo, String> {
    let version = get_current_php_version().await;

    Ok(ServiceInfo {
        running: version.is_some(),
        pid: None,
        port: None,
        version,
    })
}

async fn get_current_php_version() -> Option<String> {
    let php_path = Path::new("php/current/php.exe");
    if !php_path.exists() {
        let default_php = Path::new("php/8.2/php.exe");
        if default_php.exists() {
            return Some("8.2".to_string());
        }
        return None;
    }

    match Command::new("php/current/php.exe").arg("--version").output() {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            if let Some(start) = version_str.find("PHP ") {
                if let Some(end) = version_str[start + 4..].find(" ") {
                    return Some(version_str[start + 4..start + 4 + end].to_string());
                }
            }
            None
        }
        Err(_) => None,
    }
}

async fn check_active_php_version(version: &str) -> bool {
    let current_path = Path::new("php/current");
    if current_path.exists() {
        if let Ok(target) = std::fs::read_link(current_path) {
            if let Some(target_str) = target.to_str() {
                return target_str.contains(version);
            }
        }
    }
    false
}

async fn update_php_config(version: &str) -> Result<(), String> {
    let apache_config_path = user_config_dir().join("httpd.conf");
    if apache_config_path.exists() {
        let content = std::fs::read_to_string(&apache_config_path).map_err(|e| e.to_string())?;
        let updated_content = content.replace(
            "php/php8apache2_4.dll",
            &format!("php/current/php{}apache2_4.dll", version.replace(".", "")),
        );
        std::fs::write(&apache_config_path, updated_content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_php_versions() -> Result<Vec<PHPVersionInfo>, String> {
    let mut versions = Vec::new();

    for version in &["8.1", "8.2", "8.3", "8.4"] {
        let php_path = format!("php/{}/php.exe", version);
        let installed = Path::new(&php_path).exists();

        let active = if installed {
            check_active_php_version(version).await
        } else {
            false
        };

        versions.push(PHPVersionInfo {
            version: version.to_string(),
            status: if installed { "installed".to_string() } else { "available".to_string() },
            path: php_path,
            is_active: active,
            installed,
            download_url: format!(
                "https://windows.php.net/downloads/releases/php-{}-Win32-vs16-x64.zip",
                version
            ),
        });
    }

    Ok(versions)
}

#[tauri::command]
pub async fn switch_php_version(version: String) -> Result<bool, String> {
    let php_path = format!("php/{}/php.exe", version);
    if !Path::new(&php_path).exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    let main_php_dir = Path::new("php/current");
    let version_php_dir = format!("php/{}", version);

    if main_php_dir.exists() {
        std::fs::remove_dir_all(main_php_dir).map_err(|e| e.to_string())?;
    }

    // `mklink` is a cmd.exe builtin, not a standalone exe, so it must be invoked via `cmd /C`.
    match Command::new("cmd")
        .args(["/C", "mklink", "/J", "php\\current", &version_php_dir])
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(format!(
                    "Failed to switch PHP version (mklink failed). \
                    On some systems junction creation requires admin rights.\n\
                    stdout: {}\nstderr: {}",
                    stdout.trim(),
                    stderr.trim()
                ));
            }
            update_php_config(&version).await?;
            Ok(true)
        }
        Err(e) => Err(format!("Failed to switch PHP version: {}", e)),
    }
}

#[tauri::command]
pub async fn download_php_version(version: String) -> Result<bool, String> {
    // Placeholder. Real implementation: download zip, extract, configure.
    // Roadmap Phase 3.1.
    sleep(Duration::from_secs(3)).await;

    let php_dir = format!("php/{}", version);
    std::fs::create_dir_all(&php_dir).map_err(|e| e.to_string())?;

    let php_exe = format!("{}/php.exe", php_dir);
    std::fs::write(&php_exe, "placeholder").map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn toggle_php() -> Result<bool, String> {
    // PHP doesn't start/stop like a service, just return a status
    Ok(true)
}

#[tauri::command]
pub async fn open_php_terminal(version: String) -> Result<String, String> {
    let base_path = get_installation_path();
    let php_exe = base_path.join("php").join(&version).join("php.exe");

    if !php_exe.exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    #[cfg(windows)]
    {
        let php_dir = php_exe
            .parent()
            .ok_or_else(|| "Failed to resolve PHP directory".to_string())?;

        let command = format!(
            "cd /d \"{}\" && set PATH={}\\;%%PATH%% && php --version",
            base_path.display(),
            php_dir.display()
        );

        Command::new("cmd")
            .args(["/K", &command])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        return Err("open_php_terminal is currently implemented for Windows only".to_string());
    }

    Ok(format!("Opened PHP {} terminal", version))
}
