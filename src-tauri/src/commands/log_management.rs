//! Managed diagnostic logs only. Never handles MySQL data/binary/relay logs.
use crate::utils::paths::user_logs_dir;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::{self, File, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, path::{Path, PathBuf}, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};

pub static LOG_LOCK: Mutex<()> = Mutex::new(());
static MAINTENANCE_WAKE: tokio::sync::Notify = tokio::sync::Notify::const_new();
pub struct MaintenanceAfterStop;
impl Drop for MaintenanceAfterStop { fn drop(&mut self) { MAINTENANCE_WAKE.notify_one(); } }
const CHUNK: u64 = 64 * 1024;
const MIB: u64 = 1024 * 1024;
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn filename(id: &str) -> Result<String, String> {
    match id {
        "apache" => Ok("error.log".into()), "apache-access" => Ok("access.log".into()),
        "mysql" => Ok("mysql.log".into()), "php" => Ok("php_error.log".into()), "crash" => Ok("crash.log".into()),
        "php-8.1" | "php-8.2" | "php-8.3" | "php-8.4" | "php-8.5" => Ok(format!("{id}-error.log")),
        _ => Err("Unknown managed log identifier".into()),
    }
}
fn ids() -> Vec<&'static str> { vec!["apache", "apache-access", "mysql", "php", "php-8.1", "php-8.2", "php-8.3", "php-8.4", "php-8.5", "crash"] }
fn no_links(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(meta) => {
                #[cfg(windows)] {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 { return Err("Log paths cannot contain junctions or symbolic links".into()); }
                }
                if meta.file_type().is_symlink() { return Err("Log paths cannot contain symbolic links".into()); }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(err(e)),
        }
    }
    Ok(())
}
fn managed(root: &Path, id: &str) -> Result<PathBuf, String> {
    let path = root.join(filename(id)?); no_links(&path)?;
    if path.exists() && !path.is_file() { return Err("Log path is not a regular file".into()); }
    Ok(path)
}
fn archive_dir(root: &Path) -> Result<PathBuf, String> {
    let dir = root.join("archives"); no_links(&dir)?; fs::create_dir_all(&dir).map_err(err)?; Ok(dir)
}
fn identity(meta: &fs::Metadata) -> String {
    format!("{}", meta.created().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos())
}
fn prefix(file: &mut File, len: usize) -> Result<String, String> {
    file.seek(SeekFrom::Start(0)).map_err(err)?;
    let mut data = vec![0; len]; file.read_exact(&mut data).map_err(err)?;
    Ok(format!("{:x}", Sha256::digest(&data)))
}
#[derive(Clone, Serialize, Deserialize)]
pub struct LogCursor { identity: String, offset: u64, prefix: String, prefix_len: usize }
#[derive(Serialize)]
pub struct LogChunk { text: String, cursor: Option<LogCursor>, path: String, size: u64, missing: bool, reset: bool, skipped: bool }
fn read_chunk(root: &Path, id: &str, cursor: Option<LogCursor>, clear: bool) -> Result<LogChunk, String> {
    let path = managed(root, id)?;
    let mut file = match File::open(&path) {
        Ok(file) => file, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(LogChunk { text: String::new(), cursor: None, path: path.display().to_string(), size: 0, missing: true, reset: true, skipped: false }),
        Err(e) => return Err(format!("Cannot read log: {e}")),
    };
    let meta = file.metadata().map_err(err)?; let size = meta.len(); let identity = identity(&meta);
    let valid = if let Some(old) = &cursor {
        old.identity == identity && old.offset <= size && old.prefix_len <= 64 && old.prefix_len as u64 <= size && prefix(&mut file, old.prefix_len)? == old.prefix
    } else { false };
    let old_offset = if valid { cursor.as_ref().unwrap().offset } else { size.saturating_sub(CHUNK) };
    let start = if clear { size } else { old_offset.max(size.saturating_sub(CHUNK)) };
    let skipped = !clear && (start > old_offset || (!valid && start > 0));
    file.seek(SeekFrom::Start(start)).map_err(err)?;
    let mut bytes = vec![0; (size - start).min(CHUNK) as usize];
    file.read_exact(&mut bytes).map_err(err)?;
    // Leave an incomplete trailing UTF-8 sequence for the next read.
    let consumed = match std::str::from_utf8(&bytes) { Err(e) if e.error_len().is_none() => e.valid_up_to(), _ => bytes.len() };
    let text = String::from_utf8_lossy(&bytes[..consumed]).into_owned();
    let prefix_len = size.min(64) as usize;
    let cursor = LogCursor { identity, offset: start + consumed as u64, prefix: prefix(&mut file, prefix_len)?, prefix_len };
    Ok(LogChunk { text, cursor: Some(cursor), path: path.display().to_string(), size, missing: false, reset: !valid, skipped })
}
#[tauri::command]
pub async fn read_log_chunk(id: String, cursor: Option<LogCursor>, clear: bool) -> Result<LogChunk, String> {
    tokio::task::spawn_blocking(move || read_chunk(&user_logs_dir(), &id, cursor, clear)).await.map_err(err)?
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LogPolicy { pub enabled: bool, pub rotate_mib: u64, pub retention_days: u64, pub per_log: usize, pub budget_mib: u64 }
impl Default for LogPolicy { fn default() -> Self { Self { enabled: false, rotate_mib: 20, retention_days: 14, per_log: 10, budget_mib: 200 } } }
fn policy(root: &Path) -> Result<LogPolicy, String> {
    let path = root.join("log-policy.json"); no_links(&path)?;
    match fs::read(path) { Ok(bytes) => serde_json::from_slice(&bytes).map_err(err), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(LogPolicy::default()), Err(e) => Err(err(e)) }
}
fn validate_policy(p: &LogPolicy) -> Result<(), String> {
    if !(1..=1024).contains(&p.rotate_mib) || !(1..=3650).contains(&p.retention_days) || !(1..=1000).contains(&p.per_log) || !(10..=102400).contains(&p.budget_mib) { return Err("Rotation: 1–1024 MiB; retention: 1–3650 days; count: 1–1000; archive budget: 10–102400 MiB".into()); }
    Ok(())
}
#[tauri::command]
pub async fn get_log_policy() -> Result<LogPolicy, String> { policy(&user_logs_dir()) }
#[tauri::command]
pub async fn set_log_policy(value: LogPolicy) -> Result<(), String> {
    validate_policy(&value)?;
    let _lock = LOG_LOCK.lock().map_err(err)?;
    let root = user_logs_dir(); no_links(&root)?; fs::create_dir_all(&root).map_err(err)?;
    let path = root.join("log-policy.json"); no_links(&path)?;
    let staged = root.join(format!("log-policy-{}.pending", crate::utils::database_io::unique_suffix()));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&staged).map_err(err)?;
    file.write_all(&serde_json::to_vec_pretty(&value).map_err(err)?).map_err(err)?; file.sync_all().map_err(err)?; drop(file);
    fs::rename(&staged, &path).map_err(err)
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LogArchive { pub id: String, pub source: String, pub created: u64, pub original_bytes: u64, pub bytes: u64, pub sha256: String }
fn archive_paths(root: &Path, id: &str) -> Result<(PathBuf, PathBuf), String> {
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') { return Err("Invalid archive identifier".into()); }
    let dir = archive_dir(root)?; let data = dir.join(format!("{id}.log.gz")); let meta = dir.join(format!("{id}.json"));
    no_links(&data)?; no_links(&meta)?; Ok((data, meta))
}
fn archives(root: &Path) -> Result<Vec<LogArchive>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(archive_dir(root)?).map_err(err)? {
        let entry = entry.map_err(err)?; let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") { continue; }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else { continue; };
        let Ok((data, meta)) = archive_paths(root, id) else { continue; };
        if fs::metadata(&meta).map_err(err)?.len() > 4096 { continue; }
        let Ok(record) = serde_json::from_slice::<LogArchive>(&fs::read(&meta).map_err(err)?) else { continue; };
        if record.id != id || filename(&record.source).is_err() || !data.is_file() || record.sha256.len() != 64 { continue; }
        if fs::metadata(&data).map_err(err)?.len() != record.bytes { continue; }
        result.push(record);
    }
    result.sort_by_key(|a| std::cmp::Reverse(a.created)); Ok(result)
}
// Conservative shutdown gate in addition to exclusive handles. Does not stop any process.
fn writer_stopped(id: &str) -> Result<(), String> {
    let images: &[&str] = match id { "apache" | "apache-access" => &["httpd.exe"], "mysql" => &["mysqld.exe"], "crash" => &[], _ => &["httpd.exe", "php.exe", "php-cgi.exe"] };
    for image in images {
        if crate::utils::process::is_process_running(image) { return Err(format!("Stop {image} before archiving or deleting this log. PHP terminals may also be writers. No service was stopped.")); }
    }
    Ok(())
}
fn exclusive(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new(); options.read(true).write(true);
    #[cfg(windows)] { use std::os::windows::fs::OpenOptionsExt; options.share_mode(0); }
    options.open(path).map_err(|e| format!("Log is locked or unavailable; no contents changed: {e}"))
}
fn verify_gzip(path: &Path, expected: &LogArchive, keep_tail: bool) -> Result<String, String> {
    let mut decoder = GzDecoder::new(File::open(path).map_err(err)?);
    let mut hash = Sha256::new(); let mut total = 0u64; let mut tail = Vec::new(); let mut buffer = [0u8; 65536];
    loop {
        let count = decoder.read(&mut buffer).map_err(err)?; if count == 0 { break; }
        total += count as u64;
        if total > expected.original_bytes { return Err("Archive expands beyond its recorded size".into()); }
        hash.update(&buffer[..count]);
        if keep_tail { tail.extend_from_slice(&buffer[..count]); if tail.len() > 512 * 1024 { tail.drain(..tail.len() - 512 * 1024); } }
    }
    if total != expected.original_bytes || format!("{:x}", hash.finalize()) != expected.sha256 { return Err("Archive integrity check failed".into()); }
    Ok(String::from_utf8_lossy(&tail).into_owned())
}
fn archive_locked(root: &Path, id: &str) -> Result<LogArchive, String> {
    let path = managed(root, id)?;
    let mut source = exclusive(&path)?;
    let size = source.metadata().map_err(err)?.len(); if size == 0 { return Err("Log is empty; nothing to archive".into()); }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(err)?.as_nanos();
    let key = format!("{}-{nonce}", id.replace('.', "-"));
    let (data, meta) = archive_paths(root, &key)?;
    let partial = data.with_extension("partial"); no_links(&partial)?;
    let mut encoder = GzEncoder::new(OpenOptions::new().write(true).create_new(true).open(&partial).map_err(err)?, Compression::fast());
    let mut hash = Sha256::new(); let mut buffer = [0u8; 65536]; let mut total = 0;
    loop { let count = source.read(&mut buffer).map_err(err)?; if count == 0 { break; } encoder.write_all(&buffer[..count]).map_err(err)?; hash.update(&buffer[..count]); total += count as u64; }
    let output = encoder.finish().map_err(err)?; output.sync_all().map_err(err)?; let bytes = output.metadata().map_err(err)?.len(); drop(output);
    let record = LogArchive { id: key, source: id.into(), created: now(), original_bytes: total, bytes, sha256: format!("{:x}", hash.finalize()) };
    verify_gzip(&partial, &record, false)?;
    fs::rename(&partial, &data).map_err(err)?;
    let mut manifest = OpenOptions::new().write(true).create_new(true).open(&meta).map_err(err)?;
    manifest.write_all(&serde_json::to_vec_pretty(&record).map_err(err)?).map_err(err)?; manifest.sync_all().map_err(err)?;
    // The exclusive source handle is held throughout compression and verification.
    source.set_len(0).map_err(|e| format!("Archive {} is safe, but the active log could not be reset: {e}", data.display()))?;
    source.sync_all().map_err(err)?;
    Ok(record)
}
#[tauri::command]
pub async fn archive_log(id: String) -> Result<LogArchive, String> {
    tokio::task::spawn_blocking(move || { let _lock = LOG_LOCK.lock().map_err(err)?; filename(&id)?; writer_stopped(&id)?; archive_locked(&user_logs_dir(), &id) }).await.map_err(err)?
}
#[tauri::command]
pub async fn delete_log_contents(id: String, expected: LogCursor, confirmation: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let _lock = LOG_LOCK.lock().map_err(err)?;
        if confirmation != filename(&id)? { return Err("Type the exact log filename to confirm deletion".into()); }
        writer_stopped(&id)?; let path = managed(&user_logs_dir(), &id)?; let mut file = exclusive(&path)?;
        let meta = file.metadata().map_err(err)?;
        if identity(&meta) != expected.identity || meta.len() != expected.offset || expected.prefix_len > 64 || prefix(&mut file, expected.prefix_len)? != expected.prefix { return Err("The log changed. Refresh and review it before deleting.".into()); }
        file.set_len(0).map_err(err)?; file.sync_all().map_err(err)
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn list_log_archives() -> Result<Vec<LogArchive>, String> { tokio::task::spawn_blocking(move || archives(&user_logs_dir())).await.map_err(err)? }
#[tauri::command]
pub async fn read_log_archive(id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || { let _lock = LOG_LOCK.lock().map_err(err)?; let root = user_logs_dir(); let record = archives(&root)?.into_iter().find(|r| r.id == id).ok_or("Archive not found")?; verify_gzip(&archive_paths(&root, &id)?.0, &record, true) }).await.map_err(err)?
}
#[tauri::command]
pub async fn delete_log_archive(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || { let _lock = LOG_LOCK.lock().map_err(err)?; let root = user_logs_dir(); if !archives(&root)?.iter().any(|r| r.id == id) { return Err("Archive not found".into()); } let (data, meta) = archive_paths(&root, &id)?; fs::remove_file(data).map_err(err)?; fs::remove_file(meta).map_err(err) }).await.map_err(err)?
}
#[tauri::command]
pub async fn export_log_archive(id: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let root = user_logs_dir(); let record = archives(&root)?.into_iter().find(|r| r.id == id).ok_or("Archive not found")?;
        let Some(destination) = rfd::FileDialog::new().set_file_name(format!("{id}.log.gz")).add_filter("GZIP log", &["gz"]).save_file() else { return Ok(false); };
        let _lock = LOG_LOCK.lock().map_err(err)?; let source = archive_paths(&root, &id)?.0; verify_gzip(&source, &record, false)?;
        no_links(&destination)?;
        // Do not overwrite a source, archive or an existing user file.
        let mut out = OpenOptions::new().write(true).create_new(true).open(destination).map_err(err)?;
        std::io::copy(&mut File::open(source).map_err(err)?, &mut out).map_err(err)?; out.sync_all().map_err(err)?; Ok(true)
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn open_log_archives() -> Result<(), String> {
    let dir = archive_dir(&user_logs_dir())?;
    crate::utils::process::create_hidden_command("explorer.exe").arg(dir).spawn().map_err(err)?; Ok(())
}
fn retain(root: &Path, p: &LogPolicy) -> Result<(), String> {
    let records = archives(root)?; let mut used = 0u64; let mut counts = std::collections::HashMap::<String, usize>::new();
    for record in records {
        let count = counts.entry(record.source.clone()).or_default(); *count += 1;
        let expired = now().saturating_sub(record.created) > p.retention_days * 86400;
        if expired || *count > p.per_log || used.saturating_add(record.bytes) > p.budget_mib * MIB {
            let (data, meta) = archive_paths(root, &record.id)?; fs::remove_file(data).map_err(err)?; fs::remove_file(meta).map_err(err)?;
        } else { used += record.bytes; }
    }
    Ok(())
}
pub fn maintenance() -> Result<(), String> {
    let _lock = LOG_LOCK.lock().map_err(err)?; let root = user_logs_dir(); let p = policy(&root)?; validate_policy(&p)?;
    if !p.enabled { return Ok(()); }
    let mut failures = Vec::new();
    for id in ids() {
        let path = managed(&root, id)?;
        if fs::metadata(&path).map(|m| m.len() >= p.rotate_mib * MIB).unwrap_or(false) {
            if let Err(e) = writer_stopped(id).and_then(|_| archive_locked(&root, id)) { failures.push(format!("{id}: {e}")); }
        }
    }
    retain(&root, &p)?;
    if failures.is_empty() { Ok(()) } else { Err(failures.join("\n")) }
}
#[tauri::command]
pub async fn run_log_maintenance() -> Result<(), String> { tokio::task::spawn_blocking(maintenance).await.map_err(err)? }
pub fn start_maintenance() {
    tauri::async_runtime::spawn(async {
        loop {
            if let Ok(Err(e)) = tokio::task::spawn_blocking(maintenance).await { eprintln!("Log maintenance deferred: {e}"); }
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {},
                _ = MAINTENANCE_WAKE.notified() => {},
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf { let root = std::env::temp_dir().join(format!("dsb-logs-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos())); fs::create_dir_all(&root).unwrap(); root }
    #[test]
    fn clear_cursor_only_returns_new_bytes_and_detects_replacement() {
        let root = temp(); let path = root.join("error.log"); fs::write(&path, "old\n").unwrap();
        let cleared = read_chunk(&root, "apache", None, true).unwrap(); assert!(cleared.text.is_empty());
        OpenOptions::new().append(true).open(&path).unwrap().write_all("new 🦀\n".as_bytes()).unwrap();
        let next = read_chunk(&root, "apache", cleared.cursor, false).unwrap(); assert_eq!(next.text, "new 🦀\n");
        fs::write(&path, "replacement\n").unwrap();
        let reset = read_chunk(&root, "apache", next.cursor, false).unwrap(); assert!(reset.reset); assert_eq!(reset.text, "replacement\n"); fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn archive_verifies_before_reset_and_ignores_unknown_files() {
        let root = temp(); fs::write(root.join("crash.log"), "first\nsecond\n").unwrap();
        let record = archive_locked(&root, "crash").unwrap(); assert_eq!(fs::metadata(root.join("crash.log")).unwrap().len(), 0);
        let (data, _) = archive_paths(&root, &record.id).unwrap(); assert_eq!(verify_gzip(&data, &record, true).unwrap(), "first\nsecond\n");
        fs::write(root.join("archives/keep.txt"), "custom").unwrap(); let p = LogPolicy { budget_mib: 0, ..LogPolicy::default() }; retain(&root, &p).unwrap();
        assert!(archives(&root).unwrap().is_empty()); assert!(root.join("archives/keep.txt").exists()); fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn identifiers_and_policy_are_bounded() {
        assert!(filename("../mysql.ibd").is_err()); assert!(filename("mysql-bin").is_err());
        let root = temp(); assert!(archive_paths(&root, "../oops").is_err()); let p = LogPolicy { retention_days: 0, ..LogPolicy::default() }; assert!(validate_policy(&p).is_err()); fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_archive_is_rejected_and_failed_archive_keeps_source() {
        let root = temp(); fs::write(root.join("crash.log"), "keep me").unwrap();
        fs::write(root.join("archives"), "not a directory").unwrap();
        assert!(archive_locked(&root, "crash").is_err()); assert_eq!(fs::read_to_string(root.join("crash.log")).unwrap(), "keep me");
        fs::remove_file(root.join("archives")).unwrap();
        let record = archive_locked(&root, "crash").unwrap(); let (data, _) = archive_paths(&root, &record.id).unwrap();
        fs::write(&data, "corrupt").unwrap(); assert!(verify_gzip(&data, &record, true).is_err()); fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn bounded_reader_preserves_split_utf8_and_marks_missing() {
        let root = temp(); assert!(read_chunk(&root, "apache", None, false).unwrap().missing);
        let path = root.join("error.log"); fs::write(&path, [b'a', 0xf0, 0x9f]).unwrap();
        let first = read_chunk(&root, "apache", None, false).unwrap(); assert_eq!(first.text, "a");
        OpenOptions::new().append(true).open(&path).unwrap().write_all(&[0xa6, 0x80]).unwrap();
        assert_eq!(read_chunk(&root, "apache", first.cursor, false).unwrap().text, "🦀");
        fs::write(&path, vec![b'x'; 2 * CHUNK as usize]).unwrap(); let large = read_chunk(&root, "apache", None, false).unwrap(); assert_eq!(large.text.len(), CHUNK as usize); assert!(large.skipped); fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn active_writer_cannot_be_archived_or_truncated() {
        let root = temp(); let path = root.join("crash.log"); fs::write(&path, "important").unwrap();
        let writer = OpenOptions::new().append(true).open(&path).unwrap(); assert!(archive_locked(&root, "crash").is_err()); assert_eq!(fs::read_to_string(&path).unwrap(), "important"); drop(writer); fs::remove_dir_all(root).unwrap();
    }
}
