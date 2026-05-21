// Apache service commands.

use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::ServiceInfo;
use crate::utils::paths::{
    get_installation_path, get_user_data_root, user_config_dir, user_logs_dir, user_www_dir,
};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, get_process_pid, is_32bit_executable,
    is_process_running,
};

#[tauri::command]
pub async fn get_apache_status() -> Result<ServiceInfo, String> {
    let running = is_process_running("httpd.exe");

    let pid = if running {
        get_process_pid("httpd.exe")
    } else {
        None
    };

    let version = get_apache_version().await;

    Ok(ServiceInfo {
        running,
        pid,
        port: Some(80),
        version,
    })
}

#[tauri::command]
pub async fn start_apache() -> Result<bool, String> {
    let base_path = get_installation_path();

    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    if !apache_path.exists() {
        return Err(format!(
            "Apache binary not found at {}. Please ensure Apache is installed.",
            apache_path.display()
        ));
    }

    #[cfg(target_arch = "x86_64")]
    {
        if is_32bit_executable(&apache_path)? {
            return Err(format!(
                "Architecture Mismatch Detected.\n\n\
                Issue: Your Apache is 32-bit, but DevStackBox is 64-bit.\n\
                Solution: Download 64-bit Apache from https://www.apachelounge.com/download/\n\
                Look for: httpd-*-win64-VS17.zip\n\
                Replace: Extract Apache24 folder contents to your apache/ directory.\n\n\
                Current Apache: {}",
                apache_path.display()
            ));
        }
    }

    let config_path = user_config_dir().join("httpd.conf");
    if !config_path.exists() {
        create_default_apache_config().await?;
    }

    // Phase 5.2 - fail fast with a clear message if port 80 is taken
    // (commonly by IIS, Skype, or another web server).
    ensure_port_available(80, "Apache")?;

    std::env::set_current_dir(&base_path).map_err(|e| e.to_string())?;

    match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .arg("-t")
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Apache configuration test failed: {}", error));
            }
        }
        Err(e) => return Err(format!("Failed to test Apache configuration: {}", e)),
    }

    match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("Apache started with PID: {}", pid);

            sleep(Duration::from_secs(2)).await;

            match create_hidden_command("netstat").arg("-ano").output() {
                Ok(netstat_output) => {
                    let output_str = String::from_utf8_lossy(&netstat_output.stdout);
                    if output_str.contains(":80 ") {
                        let _ = pid;
                        Ok(true)
                    } else {
                        Err("Apache started but port 80 is not listening".to_string())
                    }
                }
                Err(_) => {
                    let _ = pid;
                    Ok(true)
                }
            }
        }
        Err(e) => Err(format!("Failed to start Apache: {}", e)),
    }
}

#[tauri::command]
pub async fn stop_apache() -> Result<bool, String> {
    if !is_process_running("httpd.exe") {
        return Err("Apache is not running".to_string());
    }

    let base_path = get_installation_path();
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");

    if apache_path.exists() {
        let config_path = user_config_dir().join("httpd.conf");

        let _ = Command::new(&apache_path)
            .args(["-f", config_path.to_str().unwrap_or(""), "-k", "stop"])
            .output();

        std::thread::sleep(Duration::from_millis(2000));
    }

    if is_process_running("httpd.exe") {
        match Command::new("taskkill")
            .args(["/F", "/IM", "httpd.exe", "/T"])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                std::thread::sleep(Duration::from_millis(1500));

                for attempt in 1..=3 {
                    if !is_process_running("httpd.exe") {
                        break;
                    }
                    if attempt < 3 {
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }

                if !is_process_running("httpd.exe") {
                    Ok(true)
                } else {
                    Err(format!(
                        "Apache processes still running after multiple kill attempts.\n\n\
                        This may happen if:\n\
                        - Apache is running with administrator privileges\n\
                        - The process is locked by another application\n\
                        - File handles are still open\n\n\
                        Try:\n\
                        1. Close any browser tabs accessing localhost\n\
                        2. Restart DevStackBox as Administrator\n\
                        3. Manually stop Apache from Task Manager\n\n\
                        Output: {}\nError: {}",
                        stdout, stderr
                    ))
                }
            }
            Err(e) => Err(format!("Failed to execute taskkill: {}", e)),
        }
    } else {
        Ok(true)
    }
}

pub async fn create_default_apache_config() -> Result<(), String> {
    let install_path = get_installation_path();
    let data_root = get_user_data_root();

    let apache_root = install_path.join("apache");
    let www_root = user_www_dir();
    let logs_root = user_logs_dir();
    let phpmyadmin_root = install_path.join("phpmyadmin");

    let config_content = format!(
        r#"# configVersion: 1
# Apache Configuration for DevStackBox
# Managed by DevStackBox. Edits to this file are preserved across upgrades
# unless the configVersion is bumped, which triggers a migration.
ServerRoot "{}"
PidFile "{}/httpd.pid"
Listen 80

# Essential modules
LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule access_compat_module modules/mod_access_compat.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule cgi_module modules/mod_cgi.so
LoadModule alias_module modules/mod_alias.so
LoadModule actions_module modules/mod_actions.so
LoadModule headers_module modules/mod_headers.so
LoadModule env_module modules/mod_env.so
LoadModule setenvif_module modules/mod_setenvif.so

ServerName localhost:80
DocumentRoot "{}"

<Directory "{}">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    DirectoryIndex index.html index.htm index.php
</Directory>

# MIME Types
TypesConfig conf/mime.types
AddType text/html .html .htm

# PHP CGI configuration - uses php/current junction, auto-follows active version
ScriptAlias /php/ "{}/php/current/"
Action php-script /php/php-cgi.exe
AddHandler php-script .php
AddType application/x-httpd-php .php

<Directory "{}/php/current">
    AllowOverride None
    Options ExecCGI
    Require all granted
</Directory>

# Error and Access logs
ErrorLog "{}/error.log"
CustomLog "{}/access.log" common

# Security
ServerTokens Prod
ServerSignature Off

# phpMyAdmin Configuration
Include "{}/phpmyadmin.conf"
"#,
        apache_root.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        www_root.display().to_string().replace("\\", "/"),
        www_root.display().to_string().replace("\\", "/"),
        install_path.display().to_string().replace("\\", "/"),
        install_path.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        user_config_dir().display().to_string().replace("\\", "/")
    );

    let phpmyadmin_config = format!(
        r#"# phpMyAdmin Virtual Host Configuration

# Create an alias for phpMyAdmin at /phpmyadmin
Alias /phpmyadmin "{}"

<Directory "{}">
    Options Indexes FollowSymLinks
    AllowOverride None
    DirectoryIndex index.php index.html
    Require ip 127.0.0.1
    Require ip ::1

    # Handle PHP files through CGI
    AddHandler php-script .php
    Action php-script /php/php-cgi.exe

    # Security rules
    <Files "*.php">
        SetHandler php-script
    </Files>

    <Files "config.inc.php">
        Require all denied
    </Files>

    <Files "setup.php">
        Require all denied
    </Files>
</Directory>

# Alias for easy access
Alias /pma "{}"
"#,
        phpmyadmin_root.display().to_string().replace("\\", "/"),
        phpmyadmin_root.display().to_string().replace("\\", "/"),
        phpmyadmin_root.display().to_string().replace("\\", "/")
    );

    let config_dir = user_config_dir();
    std::fs::write(config_dir.join("httpd.conf"), config_content).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("phpmyadmin.conf"), phpmyadmin_config).map_err(|e| e.to_string())?;

    let _ = data_root;
    Ok(())
}

async fn get_apache_version() -> Option<String> {
    let base_path = get_installation_path();
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");

    if !apache_path.exists() {
        return None;
    }

    match create_hidden_command(apache_path.to_str()?).arg("-v").output() {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            if let Some(start) = version_str.find("Apache/") {
                if let Some(end) = version_str[start + 7..].find(" ") {
                    let version = version_str[start + 7..start + 7 + end].to_string();
                    return Some(version);
                }
            }
            None
        }
        Err(e) => {
            println!("Failed to get Apache version: {}", e);
            None
        }
    }
}

#[tauri::command]
pub async fn toggle_apache() -> Result<bool, String> {
    let status = get_apache_status().await?;
    if status.running {
        stop_apache().await?;
        Ok(false)
    } else {
        start_apache().await?;
        Ok(true)
    }
}
