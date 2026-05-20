// Path resolution helpers.
//
// Two distinct roots:
//   - Installation path: where bundled binaries live (Apache, PHP, MySQL, phpMyAdmin).
//     Updated by the installer / auto-update; user data must never live here.
//   - User data root:    where runtime data lives (configs, logs, databases, www).
//     Default: %LOCALAPPDATA%\DevStackBox\ on Windows.
//     Override: env var `DEVSTACKBOX_DATA_DIR`.

use std::env;
use std::path::PathBuf;

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
    // For development environment, check if we're in src-tauri
    if let Ok(current_dir) = env::current_dir() {
        let dir_name = current_dir.file_name().and_then(|name| name.to_str());

        // If in src-tauri, go up one level
        if dir_name == Some("src-tauri") {
            if let Some(parent) = current_dir.parent() {
                return parent.to_path_buf();
            }
        }

        // Check if current directory has the server components
        if current_dir.join("apache").join("bin").join("httpd.exe").exists() {
            println!("Found server components in current dir: {}", current_dir.display());
            return current_dir;
        }
    }

    // Try to get the path from the installed location
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            if parent.join("apache").join("bin").join("httpd.exe").exists() {
                println!("Found server components at exe location: {}", parent.display());
                return parent.to_path_buf();
            }

            if let Some(grandparent) = parent.parent() {
                if grandparent.join("apache").join("bin").join("httpd.exe").exists() {
                    println!("Found server components at grandparent: {}", grandparent.display());
                    return grandparent.to_path_buf();
                }
            }
        }
    }

    // Try common installation paths in order of preference
    let possible_paths = [
        PathBuf::from("C:\\dsb"),
        PathBuf::from("C:\\Program Files\\DevStackBox"),
        PathBuf::from("C:\\DevStackBox"),
    ];

    for path in &possible_paths {
        if path.join("apache").join("bin").join("httpd.exe").exists() {
            println!("Found server components at: {}", path.display());
            return path.clone();
        }
    }

    // Ultimate fallback to current directory
    let fallback = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    println!("Using fallback path: {}", fallback.display());
    fallback
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
            let p = PathBuf::from(local_appdata).join("DevStackBox");
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

pub fn user_www_dir() -> PathBuf {
    let p = get_user_data_root().join("www");
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn user_mysql_data_dir() -> PathBuf {
    let p = get_user_data_root().join("mysql-data");
    let _ = std::fs::create_dir_all(&p);
    p
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
