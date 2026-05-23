// System-wide diagnostic and setup commands.

use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

use crate::commands::apache::{start_apache, stop_apache};
use crate::commands::mysql::{start_mysql, stop_mysql};
use crate::utils::paths::{
    ensure_user_data_dirs, get_apache_exe, get_installation_path, get_mysqld_exe,
    get_user_data_root, user_config_dir, user_www_dir,
};
use crate::utils::process::{create_hidden_command, is_32bit_executable};

#[tauri::command]
pub async fn check_binaries() -> Result<HashMap<String, bool>, String> {
    let mut binaries = HashMap::new();

    let base_path = get_installation_path();

    let mysql_path = get_mysqld_exe(&base_path);
    binaries.insert("mysql".to_string(), mysql_path.exists());

    let apache_path = get_apache_exe(&base_path);
    binaries.insert("apache".to_string(), apache_path.exists());

    let php_path = base_path.join("php").join("8.3").join("php.exe");
    binaries.insert("php8.3".to_string(), php_path.exists());

    Ok(binaries)
}

#[tauri::command]
pub async fn debug_paths() -> Result<HashMap<String, String>, String> {
    let mut paths = HashMap::new();

    let base_path = get_installation_path();

    paths.insert(
        "current_dir".to_string(),
        env::current_dir().unwrap_or_default().display().to_string(),
    );
    paths.insert("base_path".to_string(), base_path.display().to_string());

    let mysql_path = get_mysqld_exe(&base_path);
    paths.insert("mysql_path".to_string(), mysql_path.display().to_string());
    paths.insert("mysql_exists".to_string(), mysql_path.exists().to_string());

    let apache_path = get_apache_exe(&base_path);
    paths.insert("apache_path".to_string(), apache_path.display().to_string());
    paths.insert("apache_exists".to_string(), apache_path.exists().to_string());

    let php_path = base_path.join("php").join("8.3").join("php.exe");
    paths.insert("php_path".to_string(), php_path.display().to_string());
    paths.insert("php_exists".to_string(), php_path.exists().to_string());

    Ok(paths)
}

#[tauri::command]
pub async fn debug_installation() -> Result<HashMap<String, String>, String> {
    let mut debug_info = HashMap::new();

    if let Ok(exe_path) = env::current_exe() {
        debug_info.insert("exe_path".to_string(), exe_path.display().to_string());
        if let Some(parent) = exe_path.parent() {
            debug_info.insert("exe_parent".to_string(), parent.display().to_string());
        }
    }

    let install_path = get_installation_path();
    debug_info.insert(
        "detected_install_path".to_string(),
        install_path.display().to_string(),
    );

    let apache_bin = get_apache_exe(&install_path);
    let mysql_bin = get_mysqld_exe(&install_path);
    let php_bin = install_path.join("php").join("8.3").join("php.exe");
    let phpmyadmin_index = install_path.join("phpmyadmin").join("index.php");

    debug_info.insert(
        "apache_bin_path".to_string(),
        apache_bin.display().to_string(),
    );
    debug_info.insert("apache_exists".to_string(), apache_bin.exists().to_string());

    if apache_bin.exists() {
        match is_32bit_executable(&apache_bin) {
            Ok(is_32bit) => {
                debug_info.insert("apache_32bit".to_string(), is_32bit.to_string());
                debug_info.insert(
                    "apache_architecture".to_string(),
                    if is_32bit {
                        "32-bit".to_string()
                    } else {
                        "64-bit".to_string()
                    },
                );
            }
            Err(e) => {
                debug_info.insert("apache_arch_error".to_string(), e);
            }
        }
    }

    let config_dir = user_config_dir();
    let httpd_conf = config_dir.join("httpd.conf");
    let phpmyadmin_conf = config_dir.join("phpmyadmin.conf");

    debug_info.insert(
        "user_data_root".to_string(),
        get_user_data_root().display().to_string(),
    );
    debug_info.insert("config_dir".to_string(), config_dir.display().to_string());
    debug_info.insert("httpd_conf_path".to_string(), httpd_conf.display().to_string());
    debug_info.insert("httpd_conf_exists".to_string(), httpd_conf.exists().to_string());
    debug_info.insert(
        "phpmyadmin_conf_path".to_string(),
        phpmyadmin_conf.display().to_string(),
    );
    debug_info.insert(
        "phpmyadmin_conf_exists".to_string(),
        phpmyadmin_conf.exists().to_string(),
    );

    debug_info.insert("mysql_bin_path".to_string(), mysql_bin.display().to_string());
    debug_info.insert("mysql_exists".to_string(), mysql_bin.exists().to_string());

    debug_info.insert("php_bin_path".to_string(), php_bin.display().to_string());
    debug_info.insert("php_exists".to_string(), php_bin.exists().to_string());

    debug_info.insert(
        "phpmyadmin_path".to_string(),
        phpmyadmin_index.display().to_string(),
    );
    debug_info.insert(
        "phpmyadmin_exists".to_string(),
        phpmyadmin_index.exists().to_string(),
    );

    let apache_config = user_config_dir().join("httpd.conf");
    let mysql_config = user_config_dir().join("my.cnf");

    debug_info.insert(
        "apache_config_path".to_string(),
        apache_config.display().to_string(),
    );
    debug_info.insert(
        "apache_config_exists".to_string(),
        apache_config.exists().to_string(),
    );

    debug_info.insert(
        "mysql_config_path".to_string(),
        mysql_config.display().to_string(),
    );
    debug_info.insert(
        "mysql_config_exists".to_string(),
        mysql_config.exists().to_string(),
    );

    let apache_dir_readable = install_path.join("apache").exists();
    let mysql_dir_readable = install_path.join("mysql").exists();

    debug_info.insert(
        "apache_dir_readable".to_string(),
        apache_dir_readable.to_string(),
    );
    debug_info.insert(
        "mysql_dir_readable".to_string(),
        mysql_dir_readable.to_string(),
    );

    let common_paths = [
        "C:\\dsb",
        "C:\\Program Files\\DevStackBox",
        "C:\\DevStackBox",
    ];

    for path in &common_paths {
        let path_buf = PathBuf::from(path);
        let exists = path_buf.exists();
        let apache_in_path = get_apache_exe(&path_buf).exists();
        debug_info.insert(
            format!("path_{}_status", path.replace("\\", "_").replace(":", "")),
            format!("dir_exists: {}, apache_exists: {}", exists, apache_in_path),
        );
    }

    if let Ok(cwd) = env::current_dir() {
        debug_info.insert("current_working_dir".to_string(), cwd.display().to_string());
    }

    Ok(debug_info)
}

#[tauri::command]
pub async fn stop_all_services() -> Result<String, String> {
    let mut results = Vec::new();

    match stop_mysql().await {
        Ok(_) => results.push("MySQL stopped".to_string()),
        Err(e) => results.push(format!("MySQL stop failed: {}", e)),
    }

    match stop_apache().await {
        Ok(_) => results.push("Apache stopped".to_string()),
        Err(e) => results.push(format!("Apache stop failed: {}", e)),
    }

    Ok(results.join("; "))
}

#[tauri::command]
pub async fn start_all_services() -> Result<String, String> {
    let mut results = Vec::new();

    match start_apache().await {
        Ok(_) => results.push("Apache started".to_string()),
        Err(e) => results.push(format!("Apache start failed: {}", e)),
    }

    match start_mysql().await {
        Ok(_) => results.push("MySQL started".to_string()),
        Err(e) => results.push(format!("MySQL start failed: {}", e)),
    }

    Ok(results.join("; "))
}

#[tauri::command]
pub async fn test_apache_config() -> Result<String, String> {
    let base_path = get_installation_path();
    let apache_path = get_apache_exe(&base_path);
    let config_path = user_config_dir().join("httpd.conf");

    if !apache_path.exists() {
        return Err(format!(
            "Apache binary not found at: {}",
            apache_path.display()
        ));
    }

    if !config_path.exists() {
        return Err(format!(
            "Apache config not found at: {}",
            config_path.display()
        ));
    }

    let mut test_cmd = create_hidden_command(&apache_path.to_string_lossy());
    test_cmd
        .arg("-f")
        .arg(&config_path)
        .arg("-t")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    match test_cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            if output.status.success() {
                Ok(format!(
                    "Apache config test PASSED\nOutput: {}\nPath used: {}",
                    stdout,
                    apache_path.display()
                ))
            } else {
                Err(format!(
                    "Apache config test FAILED\nError: {}\nOutput: {}\nPath used: {}",
                    stderr,
                    stdout,
                    apache_path.display()
                ))
            }
        }
        Err(e) => Err(format!(
            "Failed to run Apache config test: {}\nPath: {}",
            e,
            apache_path.display()
        )),
    }
}

#[tauri::command]
pub async fn test_mysql_config() -> Result<String, String> {
    let base_path = get_installation_path();
    let mysqld_path = get_mysqld_exe(&base_path);
    let config_path = user_config_dir().join("my.cnf");

    if !mysqld_path.exists() {
        return Err(format!(
            "MySQL binary not found at: {}",
            mysqld_path.display()
        ));
    }

    if !config_path.exists() {
        return Err(format!(
            "MySQL config not found at: {}",
            config_path.display()
        ));
    }

    let mut cmd = create_hidden_command(&mysqld_path.to_string_lossy());
    cmd.arg(format!("--defaults-file={}", config_path.display()))
        .arg("--validate-config")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                Ok(format!(
                    "MySQL config validation PASSED\nOutput: {}",
                    if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
                ))
            } else {
                Err(format!(
                    "MySQL config validation FAILED\nError: {}",
                    if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
                ))
            }
        }
        Err(e) => Err(format!("Failed to run MySQL config validation: {}", e)),
    }
}

#[tauri::command]
pub async fn create_directory_structure() -> Result<String, String> {
    // Ensure all user-data directories exist (Phase 1.8).
    // Binaries are not created here; they ship inside the install dir.
    ensure_user_data_dirs();

    let www_path = user_www_dir();

    let index_php_content = include_str!("../../templates/default_index.php");
    std::fs::write(www_path.join("index.php"), index_php_content).map_err(|e| e.to_string())?;

    let phpinfo_content = include_str!("../../templates/default_phpinfo.php");
    std::fs::write(www_path.join("phpinfo.php"), phpinfo_content).map_err(|e| e.to_string())?;

    let index_html_content = include_str!("../../templates/default_index.html");
    std::fs::write(www_path.join("index.html"), index_html_content).map_err(|e| e.to_string())?;

    let test_html_content = include_str!("../../templates/default_test.html");
    std::fs::write(www_path.join("test.html"), test_html_content).map_err(|e| e.to_string())?;

    Ok("Directory structure and default web files created successfully".to_string())
}

/// Registry key + value name used for "launch DevStackBox at user login".
/// Stored under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, which
/// does not require admin rights. Shelling out to `reg.exe` avoids adding
/// a `winreg` dependency.
const AUTOSTART_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_VALUE: &str = "DevStackBox";

#[tauri::command]
pub async fn get_autostart() -> Result<bool, String> {
    let output = create_hidden_command("reg")
        .args(["query", AUTOSTART_KEY, "/v", AUTOSTART_VALUE])
        .output()
        .map_err(|e| format!("Failed to query registry: {}", e))?;
    // `reg query` exits non-zero with code 1 when the value is missing.
    Ok(output.status.success())
}

#[tauri::command]
pub async fn set_autostart(enabled: bool) -> Result<bool, String> {
    if enabled {
        let exe = env::current_exe()
            .map_err(|e| format!("Failed to resolve current exe: {}", e))?;
        // Quote the exe path so paths with spaces (e.g. Program Files) work.
        let quoted = format!("\"{}\"", exe.display());
        let output = create_hidden_command("reg")
            .args([
                "add",
                AUTOSTART_KEY,
                "/v",
                AUTOSTART_VALUE,
                "/t",
                "REG_SZ",
                "/d",
                &quoted,
                "/f",
            ])
            .output()
            .map_err(|e| format!("Failed to write registry: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    } else {
        let output = create_hidden_command("reg")
            .args(["delete", AUTOSTART_KEY, "/v", AUTOSTART_VALUE, "/f"])
            .output()
            .map_err(|e| format!("Failed to delete registry value: {}", e))?;
        // Deleting a non-existent value returns exit code 1; treat that as
        // already-disabled rather than an error.
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            if !stderr.contains("unable to find") && !stderr.contains("cannot find") {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
        }
    }
    Ok(enabled)
}

/// Run an executable with a single argument and return its trimmed stdout
/// (or stderr fallback) on success. None on any failure.
fn read_version(exe: &std::path::Path, arg: &str) -> Option<String> {
    if !exe.exists() {
        return None;
    }
    let output = create_hidden_command(&exe.to_string_lossy())
        .arg(arg)
        .output()
        .ok()?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&output.stderr).to_string();
    }
    // Most tools return multi-line banners; the first non-empty line is enough.
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn get_system_info() -> Result<crate::types::SystemInfo, String> {
    let base_path = get_installation_path();
    let httpd = get_apache_exe(&base_path);
    let mysqld = get_mysqld_exe(&base_path);
    let php_root = base_path.join("php");

    let mut php_versions: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&php_root) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    php_versions.push(name.to_string());
                }
            }
        }
    }
    php_versions.sort();

    // Pull the host Windows version from `cmd /c ver` (e.g. "Microsoft Windows
    // [Version 10.0.22631.4317]"). Cheap and dependency-free.
    let os_version = create_hidden_command("cmd")
        .args(["/c", "ver"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            s.lines()
                .map(|l| l.trim())
                .find(|l| !l.is_empty())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Windows".to_string());

    Ok(crate::types::SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        os_version,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: "2.x".to_string(),
        apache_version: read_version(&httpd, "-v"),
        mysql_version: read_version(&mysqld, "--version"),
        php_versions,
    })
}
