// Centralized MySQL client connection settings for DevStackBox.
//
// On Windows, bare `mysql -u root` can hit XAMPP/Laragon via named pipes.
// Always pin to 127.0.0.1 / TCP and the user my.cnf defaults file.

use std::path::PathBuf;
use std::process::Command;

use crate::utils::paths::{
    get_installation_path, get_mysql_client_exe, get_mysqld_exe, get_mysqldump_exe,
    user_config_dir, user_mysql_data_dir,
};
use crate::utils::process::{create_hidden_command, is_our_process_running};

pub struct MysqlConnection {
    pub defaults_file: PathBuf,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub user: String,
    pub password: Option<String>,
}

pub fn build_mysql_connection() -> Result<MysqlConnection, String> {
    Ok(MysqlConnection {
        defaults_file: user_config_dir().join("my.cnf"),
        host: "127.0.0.1".to_string(),
        port: 3306,
        protocol: "TCP".to_string(),
        user: "root".to_string(),
        password: None,
    })
}

fn apply_connection(cmd: &mut Command, conn: &MysqlConnection) {
    cmd.arg(format!("--defaults-file={}", conn.defaults_file.display()));
    cmd.arg("-h").arg(&conn.host);
    cmd.arg("--protocol=TCP");
    cmd.arg("-P").arg(conn.port.to_string());
    cmd.arg("-u").arg(&conn.user);
    if let Some(ref password) = conn.password {
        cmd.arg(format!("-p{}", password));
    }
}

pub fn mysql_command() -> Result<Command, String> {
    let base = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base);
    if !mysql_path.exists() {
        return Err(format!("mysql not found at {}", mysql_path.display()));
    }
    let conn = build_mysql_connection()?;
    let mut cmd = create_hidden_command(&mysql_path.to_string_lossy());
    apply_connection(&mut cmd, &conn);
    Ok(cmd)
}

pub fn mysqldump_command() -> Result<Command, String> {
    let base = get_installation_path();
    let dump_path = get_mysqldump_exe(&base);
    if !dump_path.exists() {
        return Err(format!("mysqldump not found at {}", dump_path.display()));
    }
    let conn = build_mysql_connection()?;
    let mut cmd = create_hidden_command(&dump_path.to_string_lossy());
    apply_connection(&mut cmd, &conn);
    Ok(cmd)
}

pub fn mysqladmin_command() -> Result<Command, String> {
    let base = get_installation_path();
    let admin_path = base.join("mysql").join("bin").join("mysqladmin.exe");
    let admin_path = if admin_path.exists() {
        admin_path
    } else {
        base.join("mysql").join("mysqladmin.exe")
    };
    if !admin_path.exists() {
        return Err(format!("mysqladmin not found at {}", admin_path.display()));
    }
    let conn = build_mysql_connection()?;
    let mut cmd = create_hidden_command(&admin_path.to_string_lossy());
    apply_connection(&mut cmd, &conn);
    Ok(cmd)
}

pub fn ensure_mysql_running() -> Result<(), String> {
    let base = get_installation_path();
    let mysqld = get_mysqld_exe(&base);
    if !is_our_process_running("mysqld.exe", &mysqld) {
        return Err(
            "DevStackBox MySQL is not running. Start MySQL from the Services page.".to_string(),
        );
    }
    Ok(())
}

/// Normalize MySQL datadir strings for comparison.
/// Paths are never hardcoded per user; `verify_mysql_datadir` compares MySQL's
/// `@@datadir` against `user_mysql_data_dir()` which resolves `%LOCALAPPDATA%`
/// (or `DEVSTACKBOX_DATA_DIR`) at runtime.
fn normalize_mysql_path(path: &str) -> String {
    let mut s = path.trim().trim_matches('"').to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        s = stripped.to_string();
    }
    if cfg!(windows) {
        s = s.replace('/', "\\");
    }
    while s.ends_with('/') || s.ends_with('\\') {
        s.pop();
    }
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_mysql_path;
    use crate::utils::paths::user_mysql_data_dir;

    #[test]
    fn forward_and_backslash_paths_match_on_windows() {
        if !cfg!(windows) {
            return;
        }
        let forward = "C:/Users/ExampleUser/AppData/Local/devstackbox/mysql-data/";
        let backslash = r"C:\Users\ExampleUser\AppData\Local\devstackbox\mysql-data";
        assert_eq!(normalize_mysql_path(forward), normalize_mysql_path(backslash));
    }

    #[test]
    fn strips_trailing_slashes() {
        if !cfg!(windows) {
            return;
        }
        let with_trailing = r"C:\data\mysql-data\\";
        let without = r"C:\data\mysql-data";
        assert_eq!(normalize_mysql_path(with_trailing), normalize_mysql_path(without));
    }

    #[test]
    fn strips_extended_path_prefix() {
        if !cfg!(windows) {
            return;
        }
        let extended = r"\\?\C:\Users\ExampleUser\AppData\Local\devstackbox\mysql-data\";
        let normal = r"C:\Users\ExampleUser\AppData\Local\devstackbox\mysql-data";
        assert_eq!(normalize_mysql_path(extended), normalize_mysql_path(normal));
    }

    #[test]
    fn user_data_dir_matches_forward_slash_mysql_output_on_windows() {
        if !cfg!(windows) {
            return;
        }
        let expected = user_mysql_data_dir();
        let forward = format!("{}/", expected.to_string_lossy().replace('\\', "/"));
        assert_eq!(
            normalize_mysql_path(&forward),
            normalize_mysql_path(&expected.to_string_lossy())
        );
    }
}

/// Mandatory check that the pinned client reached DevStackBox's datadir.
pub fn verify_mysql_datadir() -> Result<(), String> {
    let output = mysql_command()?
        .args(["-N", "-B", "-e", "SELECT @@datadir"])
        .output()
        .map_err(|e| format!("Failed to verify MySQL datadir: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "MySQL datadir check failed: {}",
            stderr.trim()
        ));
    }

    let actual = normalize_mysql_path(&String::from_utf8_lossy(&output.stdout));
    let expected = normalize_mysql_path(&user_mysql_data_dir().to_string_lossy());

    if actual != expected {
        return Err(format!(
            "Connected to the wrong MySQL instance (datadir: {}). \
             Expected DevStackBox data at {}. Stop other MySQL installations \
             (XAMPP, Laragon, WAMP, Docker) or ensure DevStackBox MySQL is running.",
            String::from_utf8_lossy(&output.stdout).trim(),
            user_mysql_data_dir().display()
        ));
    }

    Ok(())
}

/// Guard + datadir verify before data-bearing client queries.
pub fn prepare_mysql_client() -> Result<(), String> {
    ensure_mysql_running()?;
    verify_mysql_datadir()?;
    Ok(())
}
