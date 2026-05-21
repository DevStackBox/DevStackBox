// Apache service commands.

use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::ServiceInfo;
use crate::utils::paths::{
    get_installation_path, get_user_data_root, user_config_dir, user_logs_dir, user_www_dir,
};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, find_our_processes, is_32bit_executable,
    is_our_process_running, kill_pid,
};

fn apache_exe_path() -> std::path::PathBuf {
    get_installation_path()
        .join("apache")
        .join("bin")
        .join("httpd.exe")
}

#[tauri::command]
pub async fn get_apache_status() -> Result<ServiceInfo, String> {
    let exe = apache_exe_path();
    let our_pids = find_our_processes("httpd.exe", &exe);
    let running = !our_pids.is_empty();
    let pid = our_pids.first().copied();

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
    } else {
        // Auto-migrate stale configs. If the on-disk configVersion is older than
        // the current template version (2), regenerate the default config so that
        // new modules / directives are picked up without requiring a manual delete.
        let needs_regen = std::fs::read_to_string(&config_path)
            .map(|content| !content.contains("# configVersion: 2"))
            .unwrap_or(false);
        if needs_regen {
            println!("httpd.conf is from an older configVersion - regenerating default config");
            create_default_apache_config().await?;
        }
    }

    // If ssl.conf exists but contains the \\?\ UNC prefix (written by an older
    // enable_ssl that used canonicalize), delete it so Apache doesn't reject it.
    // The user can re-enable SSL from the HTTPS/SSL page to get a clean ssl.conf.
    let ssl_conf_path = user_config_dir().join("ssl.conf");
    if ssl_conf_path.exists() {
        let has_unc = std::fs::read_to_string(&ssl_conf_path)
            .map(|c| c.contains("///?/") || c.contains(r"\\?\"))
            .unwrap_or(false);
        if has_unc {
            println!("ssl.conf contains UNC paths - removing stale ssl.conf (re-enable SSL from the UI)");
            let _ = std::fs::remove_file(&ssl_conf_path);
        }
    }

    // Phase 5.2 - fail fast with a clear message if port 80 is taken
    // (commonly by IIS, Skype, or another web server).
    ensure_port_available(80, "Apache")?;

    // Run config syntax test first so we get a clear error message.
    match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .arg("-t")
        .current_dir(&base_path)
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(format!(
                    "Apache configuration test failed:\n{}{}",
                    stderr,
                    if !stdout.is_empty() {
                        format!("\n{}", stdout)
                    } else {
                        String::new()
                    }
                ));
            }
        }
        Err(e) => return Err(format!("Failed to test Apache configuration: {}", e)),
    }

    let mut child = match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .current_dir(&base_path)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to start Apache: {}", e)),
    };

    println!("Apache started with PID: {}", child.id());

    sleep(Duration::from_secs(2)).await;

    // Check if the process already exited (crash / immediate error).
    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!(
                "Apache exited immediately after starting (exit code: {}). \
                 Check the Apache error log for details.",
                status
                    .code()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "unknown".into())
            ));
        }
        Ok(None) => {} // still running — good
        Err(e) => {
            eprintln!("Could not query Apache child status: {}", e);
        }
    }

    // Verify it is actually listening on port 80.
    match create_hidden_command("netstat").arg("-ano").output() {
        Ok(netstat_output) => {
            let output_str = String::from_utf8_lossy(&netstat_output.stdout);
            if output_str.contains(":80 ") || output_str.contains(":80\t") {
                Ok(true)
            } else {
                Err("Apache process is running but port 80 is not listening yet. \
                     It may still be starting up."
                    .to_string())
            }
        }
        Err(_) => Ok(true), // netstat failed, assume success
    }
}

#[tauri::command]
pub async fn stop_apache() -> Result<bool, String> {
    let apache_path = apache_exe_path();

    if !is_our_process_running("httpd.exe", &apache_path) {
        return Err("DevStackBox Apache is not running".to_string());
    }

    if apache_path.exists() {
        let config_path = user_config_dir().join("httpd.conf");

        let _ = Command::new(&apache_path)
            .args(["-f", config_path.to_str().unwrap_or(""), "-k", "stop"])
            .output();

        std::thread::sleep(Duration::from_millis(2000));
    }

    let mut errors: Vec<String> = Vec::new();
    for attempt in 0..4 {
        let pids = find_our_processes("httpd.exe", &apache_path);
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

    if find_our_processes("httpd.exe", &apache_path).is_empty() {
        Ok(true)
    } else {
        Err(format!(
            "DevStackBox Apache processes still running after multiple kill attempts.\n\n\
            This may happen if:\n\
            - Apache is running with administrator privileges\n\
            - File handles are still open by another application\n\n\
            Try:\n\
            1. Close any browser tabs accessing localhost\n\
            2. Restart DevStackBox as Administrator\n\
            3. Manually stop the DevStackBox httpd.exe from Task Manager\n\n\
            Errors: {}",
            errors.join("; ")
        ))
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
        r#"# configVersion: 2
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

# phpMyAdmin Configuration (optional - file created on first run)
IncludeOptional "{}/phpmyadmin.conf"
# SSL Configuration (optional - enabled via HTTPS/SSL page)
IncludeOptional "{}/ssl.conf"
"#,
        apache_root.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        www_root.display().to_string().replace("\\", "/"),
        www_root.display().to_string().replace("\\", "/"),
        install_path.display().to_string().replace("\\", "/"),
        install_path.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        logs_root.display().to_string().replace("\\", "/"),
        user_config_dir().display().to_string().replace("\\", "/"),
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
