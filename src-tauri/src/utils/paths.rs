// Path resolution helpers.
//
// Two distinct roots:
//   - Installation path: where bundled binaries live (Apache, PHP, MySQL, phpMyAdmin).
//     Updated by the installer / auto-update; user data must never live here.
//   - User data root:    where runtime data lives (configs, logs, databases, www).
//     Default: %LOCALAPPDATA%\devstackbox\ on Windows.
//     Override: env var `DEVSTACKBOX_DATA_DIR`.

use std::env;
use std::path::{Path, PathBuf};

// Helper function to get the project root directory.
// Used by a few legacy helpers; prefer get_installation_path or get_user_data_root.
pub fn get_project_root() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    if current_dir.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        Ok(current_dir.parent().unwrap_or(&current_dir).to_path_buf())
    } else {
        Ok(current_dir)
    }
}

// Resolves the install dir that contains apache/, php/, mysql/, phpmyadmin/.
pub fn get_installation_path() -> PathBuf {
    // Release builds resolve only beside their own executable. Never inspect
    // the launch working directory or borrow another installation's binaries.
    #[cfg(debug_assertions)]
    {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().expect("Cargo manifest has a parent").to_path_buf()
    }
    #[cfg(not(debug_assertions))]
    {
        env::current_exe().expect("Cannot locate DevStackBox executable")
            .parent().expect("Executable has a parent").to_path_buf()
    }
}

// =====================================================================
// User Data Root (Roadmap Phase 1.8)
// =====================================================================

pub fn get_user_data_root() -> PathBuf {
    if let Ok(custom) = env::var("DEVSTACKBOX_DATA_DIR") {
        let p = PathBuf::from(custom);
        let _ = std::fs::create_dir_all(&p);
        return p;
    }

    #[cfg(windows)]
    {
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local_appdata).join("devstackbox");
            let _ = std::fs::create_dir_all(&p);
            return p;
        }
    }

    let p = get_installation_path().join("data");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_config_dir() -> PathBuf {
    let p = get_user_data_root().join("config");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_logs_dir() -> PathBuf {
    let p = get_user_data_root().join("logs");
    let _ = std::fs::create_dir_all(&p);
    p
}

/// Web root lives inside the install directory so developers can find it easily.
/// All other mutable data (configs, logs, MySQL data, SSL) remains in LOCALAPPDATA.
pub fn user_www_dir() -> PathBuf {
    let p = get_installation_path().join("www");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_mysql_data_dir() -> PathBuf {
    let p = get_user_data_root().join("mysql-data");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_tmp_dir() -> PathBuf {
    let p = get_user_data_root().join("tmp");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_sessions_dir() -> PathBuf {
    let p = user_tmp_dir().join("sessions");
    let _ = std::fs::create_dir_all(&p);
    p
}

// Converts a path to a forward-slash string safe for Apache config files.
//
// Windows canonicalize() prepends \\?\ (extended-length path prefix) which
// Apache rejects as a UNC path.  This helper strips that prefix before
// converting backslashes to forward slashes.
pub fn to_apache_path(p: &std::path::Path) -> String {
    let raw = p.to_string_lossy();
    let stripped = if let Some(s) = raw.strip_prefix(r"\\?\") {
        s.to_string()
    } else {
        raw.into_owned()
    };
    stripped.replace('\\', "/")
}

pub fn user_backups_dir() -> PathBuf {
    let p = get_user_data_root().join("backups");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_config_backups_dir() -> PathBuf {
    let p = get_user_data_root().join("config-backups");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn ensure_user_data_dirs() {
    let _ = user_config_dir();
    let _ = user_logs_dir();
    let _ = user_www_dir();
    let _ = user_mysql_data_dir();
    let _ = user_backups_dir();
    let _ = user_config_backups_dir();
    println!(
        "DevStackBox user data root: {}",
        get_user_data_root().display()
    );
}

// Binary path helpers that work with both the standard layout (bin/ subdirectory)
// and the flat layout produced by Tauri's NSIS resource bundler (no bin/ subdirectory).

/// Returns the httpd.exe path under the given base install directory.
/// Checks apache/bin/httpd.exe first (dev / standard), then apache/httpd.exe (flat NSIS install).
pub fn get_apache_exe(base: &Path) -> PathBuf {
    let with_bin = base.join("apache").join("bin").join("httpd.exe");
    if with_bin.exists() {
        return with_bin;
    }
    base.join("apache").join("httpd.exe")
}

/// Returns the mysqld.exe path under the given base install directory.
/// Checks mysql/bin/mysqld.exe first (dev / standard), then mysql/mysqld.exe (flat NSIS install).
pub fn get_mysqld_exe(base: &Path) -> PathBuf {
    let with_bin = base.join("mysql").join("bin").join("mysqld.exe");
    if with_bin.exists() {
        return with_bin;
    }
    base.join("mysql").join("mysqld.exe")
}

/// Returns the mysql.exe client path under the given base install directory.
/// Checks mysql/bin/mysql.exe first (dev / standard), then mysql/mysql.exe (flat NSIS install).
pub fn get_mysql_client_exe(base: &Path) -> PathBuf {
    let with_bin = base.join("mysql").join("bin").join("mysql.exe");
    if with_bin.exists() {
        return with_bin;
    }
    base.join("mysql").join("mysql.exe")
}

/// Returns the mysql binary directory under the given base install directory.
/// Returns mysql/bin if mysqld.exe is found there, otherwise mysql/ (flat NSIS install).
pub fn get_mysql_bin_dir(base: &Path) -> PathBuf {
    let with_bin = base.join("mysql").join("bin");
    if with_bin.join("mysqld.exe").exists() {
        return with_bin;
    }
    base.join("mysql")
}

/// Returns the mysqldump.exe path under the given base install directory.
/// Checks mysql/bin/mysqldump.exe first (dev / standard), then mysql/mysqldump.exe (flat NSIS install).
pub fn get_mysqldump_exe(base: &Path) -> PathBuf {
    let with_bin = base.join("mysql").join("bin").join("mysqldump.exe");
    if with_bin.exists() {
        return with_bin;
    }
    base.join("mysql").join("mysqldump.exe")
}

/// Returns the openssl.exe path under the given base install directory.
/// Checks apache/bin/openssl.exe first (dev / standard), then apache/openssl.exe (flat NSIS install).
pub fn get_openssl_exe(base: &Path) -> PathBuf {
    let with_bin = base.join("apache").join("bin").join("openssl.exe");
    if with_bin.exists() {
        return with_bin;
    }
    base.join("apache").join("openssl.exe")
}

/// Shared runtime resolution. Never resolves a PHP binary from PATH.
pub fn active_php_dir() -> PathBuf {
    let root = get_installation_path().join("php");
    for candidate in [root.join("current"), root.join("8.3"), root.clone()] {
        if candidate.join("php.exe").is_file() { return candidate; }
    }
    root.join("8.3")
}

pub fn active_php_ini() -> PathBuf { user_config_dir().join("php.ini") }
