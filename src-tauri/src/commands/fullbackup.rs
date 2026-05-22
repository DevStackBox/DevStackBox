// Full application backup and restore commands.
//
// Backup layout inside the zip archive:
//   manifest.json              - version info + content list
//   config/                    - all files from user_config_dir()
//   www/                       - all files from user_www_dir() (recursive)
//   mysql/all-databases.sql    - mysqldump --all-databases (if MySQL is running)

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use zip::write::SimpleFileOptions;

use crate::utils::paths::{get_installation_path, user_backups_dir, user_config_dir, user_www_dir};
use crate::utils::process::create_hidden_command;

// -------------------------------------------------------------------------
// Shared types
// -------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BackupInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub created_at_secs: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct FullBackupResult {
    pub path: String,
    pub mysql_included: bool,
}

#[derive(serde::Serialize, Clone)]
struct BackupProgress {
    stage: String,
    percent: u32,
    message: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BackupManifest {
    app_version: String,
    created_at_secs: u64,
    contents: Vec<String>,
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn full_backups_dir() -> PathBuf {
    let p = user_backups_dir().join("full");
    let _ = std::fs::create_dir_all(&p);
    p
}

fn emit(app: &tauri::AppHandle, stage: &str, percent: u32, message: &str) {
    let _ = app.emit(
        "full-backup-progress",
        BackupProgress {
            stage: stage.to_string(),
            percent,
            message: message.to_string(),
        },
    );
}

/// Collect all files under `dir` recursively.
/// Returns pairs of (zip_entry_name, absolute_file_path).
fn collect_files(dir: &Path, prefix: &str, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let zip_name = if prefix.is_empty() {
            name_str.into_owned()
        } else {
            format!("{}/{}", prefix, name_str)
        };
        if path.is_dir() {
            collect_files(&path, &zip_name, out);
        } else if path.is_file() {
            out.push((zip_name, path));
        }
    }
}

/// Validate that a path supplied by the frontend actually lives inside
/// `full_backups_dir()` to prevent path traversal.
fn validate_backup_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let base = full_backups_dir();
    // Canonicalize both sides if possible; fall back to simple prefix check.
    let canonical_base = std::fs::canonicalize(&base).unwrap_or(base.clone());
    let canonical_p = std::fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
    if !canonical_p.starts_with(&canonical_base) {
        return Err("Invalid backup path".to_string());
    }
    if p.extension().and_then(|e| e.to_str()) != Some("zip") {
        return Err("Backup file must be a .zip archive".to_string());
    }
    Ok(p)
}

// -------------------------------------------------------------------------
// Commands
// -------------------------------------------------------------------------

/// Create a full application backup zip.
/// `timestamp` is an ISO 8601 string from the frontend used as part of the filename.
#[tauri::command]
pub async fn create_full_backup(
    app: tauri::AppHandle,
    timestamp: String,
) -> Result<FullBackupResult, String> {
    // Sanitize timestamp: allow only alphanumerics, hyphens, colons, dots, 'T', 'Z'
    if timestamp.is_empty()
        || timestamp.len() > 30
        || !timestamp
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-:.TZ".contains(c))
    {
        return Err("Invalid timestamp".to_string());
    }

    // Replace colons (invalid in filenames on Windows) with hyphens
    let safe_ts = timestamp.replace(':', "-");
    let filename = format!("devstackbox-backup-{}.zip", safe_ts);
    let zip_path = full_backups_dir().join(&filename);

    emit(&app, "preparing", 0, "Preparing backup...");

    let zip_file =
        std::fs::File::create(&zip_path).map_err(|e| format!("Cannot create zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // --- manifest.json ---------------------------------------------------
    let created_at_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut contents = vec!["config".to_string(), "www".to_string()];

    // --- config/ ---------------------------------------------------------
    emit(&app, "config", 10, "Backing up configuration files...");
    let mut config_files: Vec<(String, PathBuf)> = Vec::new();
    collect_files(&user_config_dir(), "config", &mut config_files);
    for (zip_name, file_path) in &config_files {
        if let Ok(data) = std::fs::read(file_path) {
            zip.start_file(zip_name, options)
                .map_err(|e| format!("Zip error (config): {}", e))?;
            zip.write_all(&data)
                .map_err(|e| format!("Write error (config): {}", e))?;
        }
    }

    // --- www/ ------------------------------------------------------------
    emit(&app, "www", 30, "Backing up web root files...");
    let mut www_files: Vec<(String, PathBuf)> = Vec::new();
    collect_files(&user_www_dir(), "www", &mut www_files);
    for (zip_name, file_path) in &www_files {
        if let Ok(data) = std::fs::read(file_path) {
            zip.start_file(zip_name, options)
                .map_err(|e| format!("Zip error (www): {}", e))?;
            zip.write_all(&data)
                .map_err(|e| format!("Write error (www): {}", e))?;
        }
    }

    // --- mysql/all-databases.sql ----------------------------------------
    emit(&app, "mysql", 70, "Backing up MySQL databases...");
    let mysql_dump_path = get_installation_path()
        .join("mysql")
        .join("bin")
        .join("mysqldump.exe");
    let mut mysql_included = false;
    if mysql_dump_path.exists() {
        match create_hidden_command(&mysql_dump_path.to_string_lossy())
            .args(["-u", "root", "--all-databases"])
            .output()
        {
            Ok(output) if output.status.success() => {
                zip.start_file("mysql/all-databases.sql", options)
                    .map_err(|e| format!("Zip error (mysql): {}", e))?;
                zip.write_all(&output.stdout)
                    .map_err(|e| format!("Write error (mysql): {}", e))?;
                contents.push("mysql".to_string());
                mysql_included = true;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("mysqldump skipped: {}", stderr.trim());
                // Not fatal — we continue without MySQL data
            }
            Err(e) => {
                eprintln!("mysqldump exec failed: {}", e);
                // Not fatal
            }
        }
    } else {
        eprintln!("mysqldump not found, skipping MySQL backup");
    }

    // --- manifest.json ---------------------------------------------------
    let manifest = BackupManifest {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at_secs,
        contents,
    };
    let manifest_json =
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("Zip error (manifest): {}", e))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("Write error (manifest): {}", e))?;

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    emit(&app, "done", 100, "Backup complete.");
    Ok(FullBackupResult {
        path: zip_path.to_string_lossy().into_owned(),
        mysql_included,
    })
}

/// List all full backups in `backups/full/`, newest first.
#[tauri::command]
pub async fn list_full_backups() -> Result<Vec<BackupInfo>, String> {
    let dir = full_backups_dir();
    let mut list: Vec<BackupInfo> = Vec::new();

    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(list);
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("zip") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let created_at_secs = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        list.push(BackupInfo {
            path: path.to_string_lossy().into_owned(),
            filename: entry
                .file_name()
                .to_string_lossy()
                .into_owned(),
            size_bytes: meta.len(),
            created_at_secs,
        });
    }

    // Newest first
    list.sort_by(|a, b| b.created_at_secs.cmp(&a.created_at_secs));
    Ok(list)
}

/// Restore a full backup from the given zip path.
/// Overwrites config/ and www/; runs the MySQL dump if present.
#[tauri::command]
pub async fn restore_full_backup(
    app: tauri::AppHandle,
    path: String,
) -> Result<String, String> {
    let zip_path = validate_backup_path(&path)?;
    if !zip_path.exists() {
        return Err("Backup file not found".to_string());
    }

    emit(&app, "preparing", 0, "Reading backup archive...");

    let zip_file =
        std::fs::File::open(&zip_path).map_err(|e| format!("Cannot open zip: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("Invalid zip: {}", e))?;

    // Read manifest first to validate
    let manifest: BackupManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|_| "Backup is missing manifest.json — it may be corrupt".to_string())?;
        let mut buf = String::new();
        entry
            .read_to_string(&mut buf)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
        serde_json::from_str(&buf).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    emit(
        &app,
        "restoring_config",
        10,
        &format!(
            "Restoring backup from app v{}...",
            manifest.app_version
        ),
    );

    let config_dir = user_config_dir();
    let www_dir = user_www_dir();

    // Extract config/ and www/ entries
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip read error: {}", e))?;
        let zip_name = entry.name().to_string();

        if zip_name == "manifest.json" {
            continue;
        }

        // Use enclosed_name for path traversal protection
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };

        let target: PathBuf = if zip_name.starts_with("config/") {
            let sub = rel.strip_prefix("config").unwrap_or(&rel);
            config_dir.join(sub)
        } else if zip_name.starts_with("www/") {
            let sub = rel.strip_prefix("www").unwrap_or(&rel);
            www_dir.join(sub)
        } else if zip_name == "mysql/all-databases.sql" {
            // Handled separately below — skip for now
            continue;
        } else {
            continue;
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut data = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        std::fs::write(&target, &data).map_err(|e| e.to_string())?;

        if zip_name.starts_with("config/") {
            emit(&app, "restoring_config", 30, "Restoring config files...");
        } else {
            emit(&app, "restoring_www", 60, "Restoring web root files...");
        }
    }

    // --- Restore MySQL if dump is present --------------------------------
    if manifest.contents.iter().any(|c| c == "mysql") {
        emit(&app, "restoring_mysql", 80, "Restoring MySQL databases...");

        let sql_data: Option<Vec<u8>> = archive
            .by_name("mysql/all-databases.sql")
            .ok()
            .map(|mut e| {
                let mut buf = Vec::new();
                e.read_to_end(&mut buf).ok();
                buf
            });

        if let Some(sql) = sql_data {
            let mysql_exe = get_installation_path()
                .join("mysql")
                .join("bin")
                .join("mysql.exe");
            if mysql_exe.exists() && !sql.is_empty() {
                use std::process::Stdio;
                let mut child = create_hidden_command(&mysql_exe.to_string_lossy())
                    .args(["-u", "root"])
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to start mysql: {}", e))?;

                if let Some(stdin) = child.stdin.as_mut() {
                    stdin
                        .write_all(&sql)
                        .map_err(|e| format!("Failed to pipe SQL: {}", e))?;
                }
                let output = child
                    .wait_with_output()
                    .map_err(|e| format!("mysql wait failed: {}", e))?;
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("MySQL restore failed: {}", stderr.trim()));
                }
            }
        }
    }

    emit(&app, "done", 100, "Restore complete. Please restart services.");
    Ok("Restore complete.".to_string())
}

/// Delete a full backup zip. Only files inside `backups/full/` may be deleted.
#[tauri::command]
pub async fn delete_full_backup(path: String) -> Result<(), String> {
    let zip_path = validate_backup_path(&path)?;
    if !zip_path.exists() {
        return Err("Backup file not found".to_string());
    }
    std::fs::remove_file(&zip_path).map_err(|e| format!("Failed to delete backup: {}", e))?;
    Ok(())
}

/// Open the full backups folder in Windows Explorer.
#[tauri::command]
pub async fn open_backups_folder() -> Result<(), String> {
    let dir = full_backups_dir();
    std::fs::create_dir_all(&dir).ok();
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}
