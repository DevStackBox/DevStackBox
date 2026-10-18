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

use crate::utils::mysql_connection::{mysqldump_command, mysql_command, prepare_mysql_client};
use crate::utils::paths::{get_installation_path, get_mysqld_exe, user_backups_dir, user_config_dir, user_www_dir};
use crate::utils::process::is_our_process_running;

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
struct PartialFileGuard(PathBuf);
impl Drop for PartialFileGuard { fn drop(&mut self) { if !self.0.as_os_str().is_empty() { let _ = std::fs::remove_file(&self.0); } } }

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
fn collect_files(dir: &Path, prefix: &str, out: &mut Vec<(String, PathBuf)>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Cannot read {}: {e}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        { use std::os::windows::fs::MetadataExt;
          if meta.file_attributes() & 0x400 != 0 { return Err(format!("Linked folder/file requires a separate backup: {}", path.display())); }
        }
        let zip_name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        // Private local CAs are machine/account credentials, not portable project data.
        if zip_name == "config/ssl" || zip_name == "config/https" { continue; }
        if meta.is_dir() { collect_files(&path, &zip_name, out)?; }
        else if meta.is_file() { out.push((zip_name, path)); }
    }
    Ok(())
}

fn write_files(zip: &mut zip::ZipWriter<std::fs::File>, files: &[(String, PathBuf)], options: SimpleFileOptions) -> Result<(), String> {
    for (name, path) in files {
        let mut input = std::fs::File::open(path).map_err(|e| format!("Cannot back up {}: {e}", path.display()))?;
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        std::io::copy(&mut input, zip).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    let final_path = full_backups_dir().join(&filename);
    let zip_path = final_path.with_extension("partial");

    emit(&app, "preparing", 0, "Preparing backup...");

    let mut partial_guard = PartialFileGuard(zip_path.clone());
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
    collect_files(&user_config_dir(), "config", &mut config_files)?;
    write_files(&mut zip, &config_files, options)?;
    emit(&app, "www", 30, "Backing up web root files...");
    let mut www_files = Vec::new();
    collect_files(&user_www_dir(), "www", &mut www_files)?;
    write_files(&mut zip, &www_files, options)?;

    // --- mysql/all-databases.sql ----------------------------------------
    emit(&app, "mysql", 70, "Backing up MySQL databases...");
    let base = get_installation_path();
    let mysqld = get_mysqld_exe(&base);
    let mut mysql_included = false;
    if is_our_process_running("mysqld.exe", &mysqld) {
        prepare_mysql_client()?;
        let sql_path = zip_path.with_extension("sql.partial");
        let _sql_guard = PartialFileGuard(sql_path.clone());
        let sql_file = std::fs::File::create(&sql_path).map_err(|e| e.to_string())?;
        let output = mysqldump_command()?.args(["--all-databases", "--routines", "--events", "--single-transaction"])
            .stdout(std::process::Stdio::from(sql_file)).output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&sql_path);
            return Err(format!("Database backup failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
        write_files(&mut zip, &[("mysql/all-databases.sql".into(), sql_path.clone())], options)?;
        std::fs::remove_file(sql_path).map_err(|e| e.to_string())?;
        contents.push("mysql".to_string());
        mysql_included = true;
    } else {
        eprintln!("DevStackBox MySQL is not running, skipping MySQL backup");
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

    std::fs::rename(&zip_path, &final_path).map_err(|e| e.to_string())?;
    partial_guard.0.clear();
    emit(&app, "done", 100, "Backup complete.");
    Ok(FullBackupResult {
        path: final_path.to_string_lossy().into_owned(),
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
    list.sort_by_key(|b| std::cmp::Reverse(b.created_at_secs));
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
            .map_err(|_| "Backup is missing manifest.json - it may be corrupt".to_string())?;
        let mut buf = String::new();
        entry
            .read_to_string(&mut buf)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
        serde_json::from_str(&buf).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    let has_mysql = manifest.contents.iter().any(|c| c == "mysql");
    if has_mysql {
        let sql = archive.by_name("mysql/all-databases.sql").map_err(|_| "Backup is missing its database dump")?;
        if sql.size() == 0 { return Err("Backup database dump is empty".into()); }
        prepare_mysql_client()?;
    }
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let rel = entry.enclosed_name().ok_or("Unsafe archive path")?.to_path_buf();
        if entry.size() > 16 * 1024 * 1024 * 1024 { return Err("Backup entry exceeds the restore size limit".into()); }
        if let Ok(sub) = rel.strip_prefix("www") { ensure_safe_destination(&user_www_dir(), sub)?; }
        if let Ok(sub) = rel.strip_prefix("config") { ensure_safe_destination(&user_config_dir(), sub)?; }
        std::io::copy(&mut entry, &mut std::io::sink()).map_err(|e| format!("Backup is corrupt: {e}"))?;
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let recovery = create_full_backup(app.clone(), format!("before-restore-{stamp}")).await?;
    emit(&app, "recovery", 5, &format!("Recovery backup saved: {}", recovery.path));
    crate::commands::apache::stop_apache().await?;

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

    if has_mysql {
        emit(&app, "restoring_mysql", 20, "Restoring MySQL databases...");
        let sql_path = full_backups_dir().join(format!("restore-{stamp}.sql.partial"));
        let import = (|| -> Result<(), String> {
            let mut entry = archive.by_name("mysql/all-databases.sql").map_err(|e| e.to_string())?;
            let mut sql = std::fs::File::create(&sql_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut sql).map_err(|e| e.to_string())?;
            drop(sql);
            let input = std::fs::File::open(&sql_path).map_err(|e| e.to_string())?;
            let output = mysql_command()?.stdin(std::process::Stdio::from(input)).output().map_err(|e| e.to_string())?;
            if !output.status.success() { return Err(format!("Database restore failed: {}. Recovery backup: {}", String::from_utf8_lossy(&output.stderr), recovery.path)); }
            Ok(())
        })();
        let _ = std::fs::remove_file(sql_path);
        import?;
    }

    // Extract config/ and www/ entries
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip read error: {}", e))?;
        let zip_name = entry.name().to_string();
        if zip_name.starts_with("config/https/") || zip_name.starts_with("config/ssl/") { continue; }

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
            // Handled separately below - skip for now
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
        let mut output = std::fs::File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;

        if zip_name.starts_with("config/") {
            emit(&app, "restoring_config", 30, "Restoring config files...");
        } else {
            emit(&app, "restoring_www", 60, "Restoring web root files...");
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

fn ensure_safe_destination(base: &Path, relative: &Path) -> Result<(), String> {
    let mut current = base.to_path_buf();
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) { return Err("Unsafe restore path".into()); }
        current.push(component);
        if let Ok(meta) = std::fs::symlink_metadata(&current) {
            #[cfg(windows)]
            { use std::os::windows::fs::MetadataExt;
              if meta.file_attributes() & 0x400 != 0 { return Err(format!("Cannot restore through a linked path: {}", current.display())); }
            }
            if meta.file_type().is_symlink() { return Err("Cannot restore through a symbolic link".into()); }
        }
    }
    Ok(())
}
