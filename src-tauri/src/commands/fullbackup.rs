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

// Cancellation is a request flag, not a second operation lock. Ownership uses MYSQL_DATA_LOCK.
static CANCEL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Discover retained journals without parsing their contents or following a
/// path supplied in a journal. Discovery never launches SQL or deletes records.
#[tauri::command]
pub fn list_restore_recovery_records() -> Result<Vec<String>, String> {
    recovery_record_names(&full_backups_dir())
}
fn recovery_record_names(directory: &Path) -> Result<Vec<String>, String> {
    if !directory.exists() { return Ok(Vec::new()); }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("restore-") && name.ends_with(".recovery.json") && entry.file_type().map_err(|e| e.to_string())?.is_file() {
            names.push(name);
            if names.len() >= 1000 { break; }
        }
    }
    names.sort(); Ok(names)
}
#[tauri::command]
pub fn cancel_full_backup() { CANCEL.store(true, std::sync::atomic::Ordering::Release); }
fn check_cancel() -> Result<(), String> {
    if CANCEL.load(std::sync::atomic::Ordering::Acquire) { Err("Operation cancelled. If restore application began, use its recovery record; changes are not rolled back automatically.".into()) } else { Ok(()) }
}
fn copy_checked(mut input: impl Read, mut output: impl Write, limit: u64) -> Result<u64, String> {
    let mut total = 0u64;
    let mut buffer = [0; 65536];
    loop {
        check_cancel()?;
        let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { return Ok(total); }
        total = total.checked_add(n as u64).ok_or("Archive size overflow")?;
        if total > limit { return Err("Archive exceeds restore size limit".into()); }
        output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
}
fn validate_archive<R: Read + std::io::Seek>(archive: &mut zip::ZipArchive<R>) -> Result<BackupManifest, String> {
    validate_archive_limits(archive, 100_000, 32 * 1024 * 1024 * 1024)
}
fn validate_archive_limits<R: Read + std::io::Seek>(archive: &mut zip::ZipArchive<R>, count: usize, total_limit: u64) -> Result<BackupManifest, String> {
    if archive.len() > count { return Err("Too many backup entries".into()); }
    let mut names = std::collections::HashSet::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        check_cancel()?;
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.contains('\\') || name.contains(':') || name.split('/').any(|p| p == ".." || p.ends_with('.') || p.ends_with(' ')) || entry.enclosed_name().is_none() {
            return Err("Unsafe backup path".into());
        }
        if !names.insert(name.trim_end_matches('/').to_ascii_lowercase()) { return Err("Duplicate backup path".into()); }
        if !(name == "manifest.json" || name.starts_with("config/") || name.starts_with("www/") || name == "mysql/all-databases.sql") { return Err("Unsupported backup entry".into()); }
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) { return Err("Linked backup entry".into()); }
        let limit = if name == "manifest.json" { 65536 } else { 16 * 1024 * 1024 * 1024 };
        if entry.size() > limit || entry.size() > total_limit.saturating_sub(total) { return Err("Backup exceeds restore size limit".into()); }
        total += copy_checked(&mut entry, std::io::sink(), limit.min(total_limit - total))?;
    }
    let mut bytes = Vec::new();
    copy_checked(archive.by_name("manifest.json").map_err(|_| "Missing backup manifest")?, &mut bytes, 65536)?;
    let manifest: BackupManifest = serde_json::from_slice(&bytes).map_err(|_| "Invalid backup manifest")?;
    if manifest.contents.iter().any(|c| !["config", "www", "mysql"].contains(&c.as_str())) { return Err("Unsupported backup contents".into()); }
    let has_sql = names.contains("mysql/all-databases.sql");
    if has_sql != manifest.contents.iter().any(|c| c == "mysql") { return Err("Backup manifest/database mismatch".into()); }
    Ok(manifest)
}

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
        let zip_name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        // The restore transaction owns this file exclusively. It is runtime state,
        // not recoverable configuration, and must be skipped before opening it.
        if is_operation_lock(&zip_name) { continue; }
        let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        { use std::os::windows::fs::MetadataExt;
          if meta.file_attributes() & 0x400 != 0 { return Err(format!("Linked folder/file requires a separate backup: {}", path.display())); }
        }
        // Private local CAs are machine/account credentials, not portable project data.
        if zip_name == "config/ssl" || zip_name == "config/https" { continue; }
        if meta.is_dir() { collect_files(&path, &zip_name, out)?; }
        else if meta.is_file() { out.push((zip_name, path)); }
    }
    Ok(())
}

fn is_operation_lock(name: &str) -> bool {
    name.replace('\\', "/").eq_ignore_ascii_case("config/https-operation.lock")
}

fn write_files(zip: &mut zip::ZipWriter<std::fs::File>, files: &[(String, PathBuf)], options: SimpleFileOptions) -> Result<(), String> {
    for (name, path) in files {
        let mut input = std::fs::File::open(path).map_err(|e| format!("Cannot back up {}: {e}", path.display()))?;
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        copy_checked(&mut input, &mut *zip, 16 * 1024 * 1024 * 1024)?;
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
    let _site = super::ssl::SITE_LOCK.lock().await;
    let _configuration = super::ssl::lock_configuration()?;
    let _operation = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    CANCEL.store(false, std::sync::atomic::Ordering::Release);
    create_full_backup_owned(app, timestamp).await
}

async fn create_full_backup_owned(app: tauri::AppHandle, timestamp: String) -> Result<FullBackupResult, String> {
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

    let zip_file =
        std::fs::OpenOptions::new().write(true).create_new(true).open(&zip_path).map_err(|e| format!("Cannot create zip: {}", e))?;
    let mut partial_guard = PartialFileGuard(zip_path.clone());
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
            .stdout(crate::utils::mysql_process::Stdio::from(sql_file)).stderr(crate::utils::mysql_process::Stdio::piped()).spawn().map_err(|e| e.to_string())?;
        let output = crate::utils::database_io::wait_bounded(output, std::time::Duration::from_secs(3600), 65536, Some(&CANCEL))?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&sql_path);
            return Err(format!("Database backup failed: {}", super::database_workspace::mysql_failure_summary(&output.stderr)));
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

    std::fs::hard_link(&zip_path, &final_path).map_err(|e| e.to_string())?;
    std::fs::remove_file(&zip_path).map_err(|e| e.to_string())?;
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
    let _site_guard = super::ssl::SITE_LOCK.lock().await;
    let _operation = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    CANCEL.store(false, std::sync::atomic::Ordering::Release);
    let _process_lock = super::ssl::lock_configuration()?;
    let zip_path = validate_backup_path(&path)?;
    if !zip_path.exists() {
        return Err("Backup file not found".to_string());
    }

    emit(&app, "preparing", 0, "Reading backup archive...");

    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    { use std::os::windows::fs::OpenOptionsExt; options.share_mode(1); }
    let zip_file = options.open(&zip_path).map_err(|e| format!("Cannot open zip: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("Invalid zip: {}", e))?;

    let manifest = validate_archive(&mut archive)?;
    let has_mysql = manifest.contents.iter().any(|c| c == "mysql");
    if has_mysql {
        let sql = archive.by_name("mysql/all-databases.sql").map_err(|_| "Backup is missing its database dump")?;
        if sql.size() == 0 { return Err("Backup database dump is empty".into()); }
        prepare_mysql_client()?;
        crate::utils::mysql_connection::ensure_restore_server_idle()?;
    }
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let rel = entry.enclosed_name().ok_or("Unsafe archive path")?.to_path_buf();
        if entry.size() > 16 * 1024 * 1024 * 1024 { return Err("Backup entry exceeds the restore size limit".into()); }
        if let Ok(sub) = rel.strip_prefix("www") { ensure_safe_destination(&user_www_dir(), sub)?; }
        if let Ok(sub) = rel.strip_prefix("config") { ensure_safe_destination(&user_config_dir(), sub)?; }
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    check_cancel()?;
    crate::commands::apache::stop_apache_owned(&_operation).await?;
    let recovery = create_full_backup_owned(app.clone(), format!("before-restore-{stamp}")).await?;
    emit(&app, "recovery", 5, &format!("Recovery backup saved: {}", recovery.path));
    check_cancel()?;
    let record = full_backups_dir().join(format!("restore-{stamp}.recovery.json"));
    let mut journal = std::fs::OpenOptions::new().write(true).create_new(true).open(&record).map_err(|e| e.to_string())?;
    journal.write_all(serde_json::json!({"recovery_backup": recovery.path, "status": "incomplete", "instruction": "Do not automatically retry. Stop services, inspect partial state, and explicitly restore the recovery backup."}).to_string().as_bytes()).map_err(|e| e.to_string())?;
    journal.sync_all().map_err(|e| e.to_string())?;
    drop(journal);
    check_cancel()?;

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
            copy_checked(&mut entry, &mut sql, 16 * 1024 * 1024 * 1024)?;
            drop(sql);
            let input = std::fs::File::open(&sql_path).map_err(|e| e.to_string())?;
            let output = mysql_command()?.stdin(crate::utils::mysql_process::Stdio::from(input)).stdout(crate::utils::mysql_process::Stdio::null()).stderr(crate::utils::mysql_process::Stdio::piped()).spawn().map_err(|e| e.to_string())?;
            let output = crate::utils::database_io::wait_bounded(output, std::time::Duration::from_secs(3600), 65536, Some(&CANCEL))?;
            if !output.status.success() { return Err(format!("Database restore failed: {}. Recovery backup: {}", super::database_workspace::mysql_failure_summary(&output.stderr), recovery.path)); }
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
        if is_operation_lock(&zip_name) { continue; }
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

        if let Ok(sub) = target.strip_prefix(&config_dir) { ensure_safe_destination(&config_dir, sub)?; }
        if let Ok(sub) = target.strip_prefix(&www_dir) { ensure_safe_destination(&www_dir, sub)?; }
        check_cancel()?;
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        publish_restored_file(&mut entry, &target)?;

        if zip_name.starts_with("config/") {
            emit(&app, "restoring_config", 30, "Restoring config files...");
        } else {
            emit(&app, "restoring_www", 60, "Restoring web root files...");
        }
    }

    std::fs::remove_file(record).map_err(|e| e.to_string())?;
    emit(&app, "done", 100, "Restore complete. Please restart services.");
    Ok("Restore complete.".to_string())
}

/// Delete a full backup zip. Only files inside `backups/full/` may be deleted.
#[tauri::command]
pub async fn delete_full_backup(path: String) -> Result<(), String> {
    let _operation = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
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

#[cfg(test)]
mod operation_lock_tests {
    use super::*;

    #[test]
    fn recovery_backup_excludes_exclusively_held_operation_lock() {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("dsb-backup-lock-{stamp}"));
        std::fs::create_dir(&root).unwrap();
        let lock_path = root.join("https-operation.lock");
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0);
        }
        let lock = options.open(&lock_path).unwrap();
        let config = root.join("vhosts.json");
        std::fs::write(&config, b"[]").unwrap();
        let mut files = Vec::new();
        collect_files(&root, "config", &mut files).unwrap();
        assert_eq!(files, vec![("config/vhosts.json".into(), config.clone())]);
        // Older archives may contain this lock; restoration must skip it too.
        assert!(is_operation_lock("config/https-operation.lock"));
        assert!(is_operation_lock("CONFIG\\HTTPS-OPERATION.LOCK"));
        assert!(!is_operation_lock("www/https-operation.lock"));
        drop(lock);
        std::fs::remove_file(lock_path).unwrap();
        std::fs::remove_file(config).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}

#[cfg(test)]
mod archive_tests {
    use super::*;
    #[test]
    fn recovery_discovery_preserves_records_without_parsing_or_replaying() {
        let root = std::env::temp_dir().join(crate::utils::database_io::unique_suffix());
        std::fs::create_dir(&root).unwrap();
        let record = root.join("restore-interrupted.recovery.json");
        std::fs::write(&record, b"invalid JSON, must still be discoverable").unwrap();
        std::fs::write(root.join("unrelated.json"), b"ignore").unwrap();
        std::fs::create_dir(root.join("restore-directory.recovery.json")).unwrap();
        assert_eq!(recovery_record_names(&root).unwrap(), vec!["restore-interrupted.recovery.json"]);
        assert_eq!(std::fs::read(&record).unwrap(), b"invalid JSON, must still be discoverable");
        std::fs::remove_file(record).unwrap();
        std::fs::remove_file(root.join("unrelated.json")).unwrap();
        std::fs::remove_dir(root.join("restore-directory.recovery.json")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    fn archive(entries: &[(&str, Vec<u8>)]) -> zip::ZipArchive<std::io::Cursor<Vec<u8>>> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, data) in entries {
            writer.start_file(*name, SimpleFileOptions::default()).unwrap();
            writer.write_all(data).unwrap();
        }
        zip::ZipArchive::new(writer.finish().unwrap()).unwrap()
    }
    #[test]
    fn preflight_rejects_oversized_manifest_unsafe_and_duplicate_entries() {
        for entries in [
            vec![("manifest.json", vec![b' '; 65537])],
            vec![("../outside", vec![])],
            vec![("www/A", vec![]), ("www/a", vec![])],
            vec![("other/file", vec![])],
            vec![("www/file:stream", vec![])],
        ] { assert!(validate_archive(&mut archive(&entries)).is_err()); }
        assert!(validate_archive_limits(&mut archive(&[("www/a", vec![1; 4]), ("www/b", vec![1; 4])]), 1, 100).is_err());
        assert!(validate_archive_limits(&mut archive(&[("www/a", vec![1; 4]), ("www/b", vec![1; 4])]), 10, 7).is_err());
        let manifest = br#"{"app_version":"test","created_at_secs":0,"contents":["config","www"]}"#.to_vec();
        assert!(validate_archive(&mut archive(&[("manifest.json", manifest), ("www/index.php", b"test".to_vec())])).is_ok());
    }
    #[test]
    fn streaming_limit_stops_before_writing_excess_bytes() {
        let mut out = Vec::new();
        assert!(copy_checked(&b"12345"[..], &mut out, 4).is_err());
        assert!(out.is_empty());
    }
}

#[cfg(test)]
mod lifecycle_tests {
    #[test]
    fn shared_owner_blocks_service_changes_and_exit_registry() {
        let owner = super::super::mysql_import::MYSQL_DATA_LOCK.try_lock().unwrap();
        assert!(super::super::database_workspace::has_active_database_operation());
        tauri::async_runtime::block_on(async {
            assert!(super::super::apache::stop_apache().await.is_err());
            assert!(super::super::apache::start_apache().await.is_err());
            assert!(super::super::mysql::stop_mysql().await.is_err());
            assert!(super::super::mysql::start_mysql().await.is_err());
        });
        drop(owner);
    }
}

fn publish_restored_file(input: impl Read, target: &Path) -> Result<(), String> {
    let temporary = target.with_extension(format!("{}.restore-partial", crate::utils::database_io::unique_suffix()));
    let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
    let _cleanup = PartialFileGuard(temporary.clone());
    copy_checked(input, &mut output, 16 * 1024 * 1024 * 1024)?;
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    check_cancel()?;
    std::fs::rename(temporary, target).map_err(|e| e.to_string())
}
#[cfg(test)]
mod publish_tests {
    use super::*;
    #[test]
    fn failed_restore_read_preserves_original_file() {
        struct Broken;
        impl Read for Broken { fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> { Err(std::io::Error::other("fixture read failure")) } }
        let root = std::env::temp_dir().join(crate::utils::database_io::unique_suffix());
        std::fs::create_dir(&root).unwrap();
        let target = root.join("config.ini");
        std::fs::write(&target, "original").unwrap();
        assert!(publish_restored_file(Broken, &target).is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "original");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        publish_restored_file(&b"restored"[..], &target).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "restored");
        std::fs::remove_file(target).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
