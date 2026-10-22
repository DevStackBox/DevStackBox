// Streamed .sql restore into DevStackBox MySQL (no in-memory SQL strings).

use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::utils::mysql_connection::{mysql_command, prepare_mysql_client};

pub static MYSQL_DATA_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

const MAX_SQL_FILE_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const SNIFF_BYTES: usize = 256 * 1024;
const STDERR_TAIL_MAX: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlRestoreMode {
    FollowDump,
    InitialDatabase,
}

impl SqlRestoreMode {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "follow_dump" => Ok(Self::FollowDump),
            "initial_database" => Ok(Self::InitialDatabase),
            _ => Err("Invalid restore mode".into()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlRestoreFileInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub suggests_follow_dump: bool,
    pub hint_message: Option<String>,
}

pub fn validate_sql_file_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("SQL file path must be absolute".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("Cannot read file: {e}"))?;
    if !meta.is_file() {
        return Err("Path is not a regular file".into());
    }
    if meta.len() > MAX_SQL_FILE_BYTES {
        return Err("SQL file exceeds the maximum supported size (32 GiB)".into());
    }
    let canonical = std::fs::canonicalize(&p).map_err(|e| format!("Invalid file path: {e}"))?;
    Ok(canonical)
}

pub fn sniff_sql_restore_file(path: &Path) -> Result<(bool, Option<String>), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut buf = vec![0_u8; SNIFF_BYTES];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    let sample = String::from_utf8_lossy(&buf).to_ascii_lowercase();
    let has_create_db = sample.contains("create database");
    let has_use = sample.contains("\nuse ") || sample.starts_with("use ");
    let suggests = has_create_db || has_use;
    let hint = if has_create_db {
        Some(
            "This file appears to contain CREATE DATABASE statements. \
             Use “Restore using database names in the file”."
                .into(),
        )
    } else {
        None
    };
    Ok((suggests, hint))
}

pub fn sql_restore_file_info(path: &str) -> Result<SqlRestoreFileInfo, String> {
    let canonical = validate_sql_file_path(path)?;
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let file_name = canonical
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("dump.sql")
        .to_string();
    let (suggests_follow_dump, hint_message) = sniff_sql_restore_file(&canonical)?;
    Ok(SqlRestoreFileInfo {
        path: canonical.display().to_string(),
        file_name,
        size_bytes: meta.len(),
        suggests_follow_dump,
        hint_message,
    })
}

fn append_stderr_tail(tail: &mut Vec<u8>, chunk: &[u8]) {
    tail.extend_from_slice(chunk);
    if tail.len() > STDERR_TAIL_MAX {
        let drop = tail.len() - STDERR_TAIL_MAX;
        tail.drain(0..drop);
    }
}

fn run_mysql_import_blocking(
    file_path: &Path,
    mode: SqlRestoreMode,
    initial_database: Option<&str>,
    create_database: bool,
) -> Result<u64, String> {
    prepare_mysql_client()?;

    if mode == SqlRestoreMode::InitialDatabase {
        let db = initial_database.ok_or("Database name is required for this restore mode")?;
        if create_database {
            let escaped = db.replace('`', "``");
            let q = format!("CREATE DATABASE IF NOT EXISTS `{escaped}`;");
            let out = mysql_command()?
                .args(["-e", &q])
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(format!(
                    "Could not create database: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
        }
    }

    let mut cmd = mysql_command()?;
    if mode == SqlRestoreMode::InitialDatabase {
        if let Some(db) = initial_database {
            cmd.arg(format!("--database={db}"));
        }
    }

    let file = File::open(file_path).map_err(|e| format!("Failed to open SQL file: {e}"))?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();

    let mut child: Child = cmd
        .stdin(Stdio::from(file))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start mysql client: {e}"))?;

    let stderr = child.stderr.take();
    let stderr_tail: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let tail_reader = stderr_tail.clone();
    let reader = thread::spawn(move || {
        if let Some(mut err) = stderr {
            let mut chunk = [0_u8; 8192];
            loop {
                match err.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        if let Ok(mut tail) = tail_reader.lock() {
                            append_stderr_tail(&mut tail, &chunk[..n]);
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    });

    let status = child
        .wait()
        .map_err(|e| format!("Failed waiting for mysql: {e}"))?;
    let _ = reader.join();

    if !status.success() {
        let msg = stderr_tail
            .lock()
            .ok()
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "mysql client exited with an error".into());
        return Err(format!(
            "Import failed; some changes may already have been applied. {msg}"
        ));
    }

    Ok(size)
}

#[tauri::command]
pub async fn pick_sql_restore_file() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Select SQL file to restore")
            .add_filter("SQL", &["sql"])
            .pick_file()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sql_restore_file_info(path: String) -> Result<SqlRestoreFileInfo, String> {
    tauri::async_runtime::spawn_blocking(move || sql_restore_file_info(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_mysql_from_file(
    file_path: String,
    restore_mode: String,
    initial_database: Option<String>,
    create_database: bool,
) -> Result<String, String> {
    let mode = SqlRestoreMode::parse(&restore_mode)?;
    let canonical = validate_sql_file_path(&file_path)?;

    if mode == SqlRestoreMode::InitialDatabase {
        let db = initial_database.as_deref().ok_or("Choose a database name")?;
        super::mysql::validate_database_name(db)?;
    }

    let path_for_thread = canonical.clone();
    let db = initial_database.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let _lock = MYSQL_DATA_LOCK
            .lock()
            .map_err(|_| "Another database import or maintenance operation is in progress.")?;
        run_mysql_import_blocking(&path_for_thread, mode, db.as_deref(), create_database)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(format!(
        "Imported {} bytes from {}",
        bytes,
        canonical.display()
    ))
}

#[tauri::command]
pub async fn apply_php_recommended_import_limits() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(apply_php_recommended_import_limits_blocking)
        .await
        .map_err(|e| e.to_string())?
}

fn apply_php_recommended_import_limits_blocking() -> Result<String, String> {
    use crate::utils::paths::{to_apache_path, user_config_dir, user_tmp_dir};
    use crate::utils::php_ini_import::apply_recommended_import_limits;

    let php_ini = user_config_dir().join("php.ini");
    if !php_ini.is_file() {
        crate::commands::php::patch_php_ini();
    }
    let content = std::fs::read_to_string(&php_ini)
        .map_err(|e| format!("Could not read php.ini: {e}"))?;
    let tmp = to_apache_path(&user_tmp_dir());
    let updated = apply_recommended_import_limits(&content, Some(&tmp));
    std::fs::write(&php_ini, updated)
        .map_err(|e| format!("Could not write php.ini: {e}"))?;
    Ok("Recommended PHP import limits applied. Restart Apache for phpMyAdmin to pick them up.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn restore_mode_parse_rejects_unknown() {
        assert!(SqlRestoreMode::parse("bogus").is_err());
        assert_eq!(
            SqlRestoreMode::parse("follow_dump").unwrap(),
            SqlRestoreMode::FollowDump
        );
    }

    #[test]
    fn sniff_detects_create_database_hint() {
        let dir = std::env::temp_dir().join(format!(
            "devstackbox-sql-sniff-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("hint.sql");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, "-- header").unwrap();
            writeln!(f, "CREATE DATABASE `test`;").unwrap();
        }
        let (suggests, hint) = sniff_sql_restore_file(&path).unwrap();
        assert!(suggests);
        assert!(hint.is_some());
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(dir);
    }
}
