// System-wide diagnostic and setup commands.

use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

use crate::commands::apache::stop_apache;
use crate::commands::mysql::stop_mysql;
use crate::utils::paths::{
    ensure_user_data_dirs, get_installation_path, get_user_data_root, user_config_dir,
    user_www_dir,
};
use crate::utils::process::{create_hidden_command, is_32bit_executable};

#[tauri::command]
pub async fn check_binaries() -> Result<HashMap<String, bool>, String> {
    let mut binaries = HashMap::new();

    let base_path = get_installation_path();

    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    binaries.insert("mysql".to_string(), mysql_path.exists());

    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
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

    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    paths.insert("mysql_path".to_string(), mysql_path.display().to_string());
    paths.insert("mysql_exists".to_string(), mysql_path.exists().to_string());

    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
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

    let apache_bin = install_path.join("apache").join("bin").join("httpd.exe");
    let mysql_bin = install_path.join("mysql").join("bin").join("mysqld.exe");
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
        let apache_in_path = path_buf.join("apache").join("bin").join("httpd.exe").exists();
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
pub async fn test_apache_config() -> Result<String, String> {
    let base_path = get_installation_path();
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
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
