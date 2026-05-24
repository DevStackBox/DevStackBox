// Apache service commands.

use std::time::Duration;
use tokio::time::sleep;

use crate::commands::php::patch_php_ini;
use crate::types::ServiceInfo;
use crate::utils::paths::{
    get_apache_exe, get_installation_path, get_user_data_root, user_config_dir, user_logs_dir,
    user_www_dir,
};
use crate::utils::process::{
    create_hidden_command, ensure_port_available, find_our_processes, is_32bit_executable,
    is_our_process_running, kill_pid,
};

fn apache_exe_path() -> std::path::PathBuf {
    let base = get_installation_path();
    get_apache_exe(&base)
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

    let apache_path = get_apache_exe(&base_path);
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
            .map(|content| !content.contains("# configVersion: 7"))
            .unwrap_or(false);
        if needs_regen {
            println!("Detected outdated Apache config (pre-v7). Migrating to configVersion 7...");
            create_default_apache_config().await?;
        }
    }

    // If ssl.conf exists but contains a \\?\ / //?/ UNC prefix (written by an
    // older enable_ssl that used canonicalize), delete it and immediately
    // regenerate it with correct paths so the user doesn't have to do anything.
    let ssl_conf_path = user_config_dir().join("ssl.conf");
    if ssl_conf_path.exists() {
        let has_unc = std::fs::read_to_string(&ssl_conf_path)
            .map(|c| c.contains("//?/") || c.contains(r"\\?\"))
            .unwrap_or(false);
        if has_unc {
            println!("ssl.conf contains UNC paths - removing and regenerating ssl.conf");
            let _ = std::fs::remove_file(&ssl_conf_path);
        }
    }
    // If ssl.conf is absent but certs already exist (e.g. it was deleted by
    // the migration above, or the file was lost), regenerate it automatically
    // so HTTPS comes back without the user having to click "Enable SSL" again.
    if !ssl_conf_path.exists() {
        crate::commands::ssl::repair_ssl_conf();
    }

    // Ensure php.ini has session.save_path and extension_dir set correctly
    // so phpMyAdmin and PHP apps work without manual php.ini editing.
    patch_php_ini();

    // Seed the www dir with default files if it is still empty.
    seed_www_dir();

    // Phase 5.2 - fail fast with a clear message if port 80 is taken
    // (commonly by IIS, Skype, or another web server).
    ensure_port_available(80, "Apache")?;

    // Run config syntax test first so we get a clear error message.
    // NOTE: on some Apache Lounge Win64 builds mod_ssl causes httpd -t to
    // crash with an access violation (0xC0000005) even though Apache starts
    // fine in normal mode.  We therefore only treat the test as a hard
    // failure when it produces actual error text.  A crash with no output is
    // silently skipped - the real startup below will catch genuine problems.
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
                let error_text = format!("{}{}", stderr, stdout);
                // Only abort if there is actual diagnostic text.  A blank
                // result means httpd -t itself crashed (e.g. mod_ssl AV on
                // Windows); in that case proceed and let Apache self-report.
                if !error_text.trim().is_empty() {
                    return Err(format!(
                        "Apache configuration test failed: {}",
                        error_text.trim()
                    ));
                }
                println!("httpd -t exited non-zero with no output (likely mod_ssl AV) - proceeding with start");
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

    // Apache mpm_winnt spawns a worker child process and the parent may exit
    // shortly after (including with an AV crash code on some Apache Lounge
    // Win64 builds).  Treat a parent exit as non-fatal and let the port check
    // below decide whether the server is actually up.
    match child.try_wait() {
        Ok(Some(status)) => {
            println!(
                "Apache parent process exited (code: {}) - checking port 80 for worker process",
                status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into())
            );
        }
        Ok(None) => {} // parent still running - good
        Err(e) => {
            eprintln!("Could not query Apache child status: {}", e);
        }
    }

    // Verify the worker is actually listening on port 80.
    match create_hidden_command("netstat").arg("-ano").output() {
        Ok(netstat_output) => {
            let output_str = String::from_utf8_lossy(&netstat_output.stdout);
            if output_str.contains(":80 ") || output_str.contains(":80\t") {
                Ok(true)
            } else {
                Err("Apache did not start: port 80 is not listening. \
                     Check the Apache error log for details."
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

        let _ = create_hidden_command(&apache_path.to_string_lossy())
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

    // user_config_dir path formatted for Apache.
    let user_config_apache = crate::utils::paths::to_apache_path(&user_config_dir());

    let www_root_str = www_root.display().to_string().replace('\\', "/");

    // Detect flat NSIS layout vs standard layout with bin/ subdirectory.
    // NSIS flattens apache/modules/ -> apache/ and apache/conf/ -> apache/.
    let modules_prefix = if apache_root.join("modules").exists() {
        "modules/"
    } else {
        "" // flat layout: .so files are directly in apache/
    };

    // TypesConfig: conf/mime.types in standard layout, mime.types in flat layout.
    let mime_types_path = if apache_root.join("conf").join("mime.types").exists() {
        format!(
            "{}/conf/mime.types",
            apache_root.display().to_string().replace('\\', "/")
        )
    } else {
        format!(
            "{}/mime.types",
            apache_root.display().to_string().replace('\\', "/")
        )
    };

    // PHP-CGI path: php/current/ junction in dev layout, php/ directly in flat NSIS layout.
    let php_cgi_dir = if install_path.join("php").join("current").exists() {
        install_path.join("php").join("current")
    } else {
        install_path.join("php")
    };
    let php_cgi_dir_str = php_cgi_dir.display().to_string().replace('\\', "/");

    let config_content = format!(
        r#"# configVersion: 8
# Apache Configuration for DevStackBox
# Managed by DevStackBox. Edits to this file are preserved across upgrades
# unless the configVersion is bumped, which triggers a migration.
ServerRoot "{apache_root_str}"
PidFile "{logs_root_str}/httpd.pid"
Listen 80

# Essential modules
LoadModule dir_module {mp}mod_dir.so
LoadModule mime_module {mp}mod_mime.so
LoadModule rewrite_module {mp}mod_rewrite.so
LoadModule authz_core_module {mp}mod_authz_core.so
LoadModule authz_host_module {mp}mod_authz_host.so
LoadModule access_compat_module {mp}mod_access_compat.so
LoadModule log_config_module {mp}mod_log_config.so
LoadModule cgi_module {mp}mod_cgi.so
LoadModule alias_module {mp}mod_alias.so
LoadModule actions_module {mp}mod_actions.so
LoadModule headers_module {mp}mod_headers.so
LoadModule env_module {mp}mod_env.so
LoadModule setenvif_module {mp}mod_setenvif.so

ServerName localhost:80
DocumentRoot "{www_root_str}"

<Directory "{www_root_str}">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    DirectoryIndex index.php index.html index.htm
</Directory>

# MIME Types
TypesConfig "{mime_types}"
AddType text/html .html .htm

# PHP CGI configuration
ScriptAlias /php/ "{php_cgi_dir_str}/"
Action php-script /php/php-cgi.exe
AddHandler php-script .php
AddType application/x-httpd-php .php

# Tell PHP-CGI where to find its php.ini.  The user-config php.ini is written
# to the user data dir so it never pollutes the installation directory.
SetEnv PHPRC "{user_config}/"

<Directory "{php_cgi_dir_str}">
    AllowOverride None
    Options ExecCGI
    Require all granted
</Directory>

# Error and Access logs
ErrorLog "{logs_root_str}/error.log"
CustomLog "{logs_root_str}/access.log" common

# Security
ServerTokens Prod
ServerSignature Off

# phpMyAdmin Configuration (optional - file created on first run)
IncludeOptional "{user_config_str}/phpmyadmin.conf"
# SSL Configuration (optional - enabled via HTTPS/SSL page)
IncludeOptional "{user_config_str}/ssl.conf"
# Default virtual host for localhost.
# This is always the FIRST VirtualHost. Once user vhosts are added, Apache
# uses name-based selection; localhost must be first so http://localhost/
# and http://localhost/phpmyadmin always work regardless of user vhosts.
<VirtualHost *:80>
    ServerName localhost
    ServerAlias 127.0.0.1
    DocumentRoot "{www_root_str}"
    <Directory "{www_root_str}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html index.htm
    </Directory>

    # PHP handler - explicit inside VirtualHost so it is not subject to
    # global-scope merge behavior in name-based virtual host mode.
    AddHandler php-script .php
    Action php-script /php/php-cgi.exe
    AddType application/x-httpd-php .php

    # phpMyAdmin - Alias inside VirtualHost because global-scope Alias
    # directives are not reliably inherited in name-based vhost mode.
    Alias /phpmyadmin "{pma_root}"
    Alias /pma "{pma_root}"
    <Directory "{pma_root}">
        Options -Indexes +FollowSymLinks
        AllowOverride None
        DirectoryIndex index.php
        Require all granted
        <FilesMatch "\.php$">
            SetHandler php-script
        </FilesMatch>
        <Files "config.inc.php">
            Require all denied
        </Files>
    </Directory>
</VirtualHost>
# Virtual Hosts (optional - managed via Virtual Hosts page)
IncludeOptional "{user_config_str}/vhosts.conf"
"#,
        apache_root_str = apache_root.display().to_string().replace('\\', "/"),
        logs_root_str = logs_root.display().to_string().replace('\\', "/"),
        www_root_str = www_root_str,
        mp = modules_prefix,
        mime_types = mime_types_path,
        php_cgi_dir_str = php_cgi_dir_str,
        user_config = user_config_apache,
        user_config_str = user_config_dir().display().to_string().replace('\\', "/"),
        pma_root = phpmyadmin_root.display().to_string().replace('\\', "/")
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

    // Seed the user www dir with default files if it is empty.
    seed_www_dir();

    let _ = data_root;
    Ok(())
}

// Ensures the web root directory exists and contains a minimal index.html.
// In the current architecture, user_www_dir() points to the install-dir www/
// so no file copying is needed — installer already placed files there.
// Files are only written if absent, so user edits are never overwritten.
fn seed_www_dir() {
    let www_dir = user_www_dir();
    let index = www_dir.join("index.html");
    if !index.exists() {
        let _ = std::fs::write(
            &index,
            "<!DOCTYPE html><html><head><title>DevStackBox</title></head>\
             <body><h1>DevStackBox is running</h1>\
             <p>Place your PHP projects in this folder.</p>\
             <p><a href=\"/phpmyadmin/\">phpMyAdmin</a></p></body></html>\n",
        );
    }
}

async fn get_apache_version() -> Option<String> {
    let base_path = get_installation_path();
    let apache_path = get_apache_exe(&base_path);

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
