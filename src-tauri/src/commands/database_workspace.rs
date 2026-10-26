//! Local database workspace. Jobs are native and survive page navigation, not app exit.
use super::mysql::{ensure_user_database, run_mysql_query, validate_database_name};
use crate::utils::{
    database_io::unique_suffix,
    mysql_connection::{mysql_command, mysqldump_command, prepare_mysql_client},
    mysql_sql::{escape_mysql_string_literal, quote_mysql_user_host},
    paths::user_backups_dir,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};

const MAX_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const MAX_ITEMS: usize = 100;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub source: String,
    pub target: Option<String>,
    pub status: String,
    pub bytes: u64,
    pub output: Option<String>,
    pub error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub started: u64,
    pub finished: Option<u64>,
    pub items: Vec<Item>,
    pub error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub kind: String,
    pub sources: Vec<String>,
    pub targets: Vec<Option<String>>,
    pub format: String,
    pub content: String,
    pub destination: Option<String>,
    pub reviewed: bool,
}
struct Job {
    operation: Operation,
    cancel: Arc<AtomicBool>,
}
static JOBS: OnceLock<Mutex<Vec<Job>>> = OnceLock::new();
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn history_path() -> PathBuf {
    user_backups_dir().join("mysql-workspace-history.json")
}
fn jobs() -> &'static Mutex<Vec<Job>> {
    JOBS.get_or_init(|| {
        let mut history: Vec<Operation> = fs::read(history_path())
            .ok()
            .filter(|b| b.len() < 2_000_000)
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        history.truncate(50);
        Mutex::new(
            history
                .into_iter()
                .map(|mut operation| {
                    if ["queued", "running"].contains(&operation.status.as_str()) {
                        operation.status = "interrupted".into();
                        for item in &mut operation.items {
                            if ["queued", "running"].contains(&item.status.as_str()) {
                                item.status = "interrupted".into();
                            }
                        }
                    }
                    Job {
                        operation,
                        cancel: Arc::new(AtomicBool::new(false)),
                    }
                })
                .collect(),
        )
    })
}
fn update(id: &str, f: impl FnOnce(&mut Operation)) {
    if let Ok(mut jobs) = jobs().lock() {
        if let Some(job) = jobs.iter_mut().find(|j| j.operation.id == id) {
            f(&mut job.operation);
        }
    }
}
fn save_history() {
    if let Ok(jobs) = jobs().lock() {
        let records: Vec<_> = jobs.iter().take(50).map(|j| &j.operation).collect();
        if let Ok(bytes) = serde_json::to_vec_pretty(&records) {
            let path = history_path();
            let temp = path.with_extension("tmp");
            if fs::write(&temp, bytes).is_ok() {
                let _ = fs::rename(temp, path);
            }
        }
    }
}
#[tauri::command]
pub fn database_operations() -> Result<Vec<Operation>, String> {
    Ok(jobs()
        .lock()
        .map_err(|_| "Operation history unavailable")?
        .iter()
        .map(|j| j.operation.clone())
        .collect())
}
#[tauri::command]
pub fn cancel_database_operation(id: String) -> Result<(), String> {
    let jobs = jobs().lock().map_err(|_| "Operation history unavailable")?;
    let job = jobs
        .iter()
        .find(|j| j.operation.id == id)
        .ok_or("Operation not found")?;
    job.cancel.store(true, Ordering::Relaxed);
    Ok(())
}

fn validate_request(r: &Request) -> Result<(), String> {
    if !["export", "backup", "serverBackup", "import"].contains(&r.kind.as_str()) {
        return Err("Unsupported operation".into());
    }
    if r.sources.is_empty() || r.sources.len() > MAX_ITEMS {
        return Err("Select between 1 and 100 items".into());
    }
    if !["sql", "gzip", "zip"].contains(&r.format.as_str())
        || !["all", "structure", "data"].contains(&r.content.as_str())
    {
        return Err("Unsupported format or content mode".into());
    }
    if r.kind == "import" && !r.reviewed {
        return Err("Review the SQL risks and target databases before importing".into());
    }
    if r.kind == "serverBackup"
        && (r.sources != vec!["server".to_string()]
            || !r.reviewed
            || r.format != "sql"
            || r.content != "all")
    {
        return Err("Review the full-server backup scope before starting".into());
    }
    let mut seen = HashSet::new();
    for source in &r.sources {
        if !seen.insert(source.to_lowercase()) {
            return Err("Duplicate sources are not allowed".into());
        }
        if r.kind != "import" {
            validate_database_name(source)?;
            ensure_user_database(source)?;
        } else {
            validate_input(source)?;
        }
    }
    if r.kind == "import" {
        if r.targets.len() != r.sources.len() {
            return Err("Review every import target".into());
        }
        let mut targets = HashSet::new();
        for name in r.targets.iter().flatten() {
            let name = validate_database_name(name)?;
            ensure_user_database(&name)?;
            if !targets.insert(name.to_lowercase()) {
                return Err("Duplicate targets require separate, reviewed imports".into());
            }
        }
        // Arbitrary original-name dumps may overlap. Do not claim we can establish their targets.
        if r.sources.len() > 1 && r.targets.iter().any(Option::is_none) {
            return Err(
                "Import original-name dumps individually; their targets may overlap".into(),
            );
        }
    }
    Ok(())
}
fn validate_input(source: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(source);
    if !path.is_absolute() {
        return Err("Choose an absolute file path".into());
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("Input must be a regular file no larger than 32 GiB".into());
    }
    let lower = source.to_lowercase();
    if ![".sql", ".sql.gz", ".zip"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        return Err("Choose SQL, SQL.GZ or a DevStackBox ZIP package".into());
    }
    fs::canonicalize(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_database_operation(request: Request) -> Result<String, String> {
    validate_request(&request)?;
    let mut registry = jobs().lock().map_err(|_| "Operation history unavailable")?;
    if registry
        .iter()
        .any(|j| ["running", "queued"].contains(&j.operation.status.as_str()))
    {
        return Err("Wait for the current database operation to finish".into());
    }
    let id = unique_suffix();
    let cancel = Arc::new(AtomicBool::new(false));
    let items = request
        .sources
        .iter()
        .enumerate()
        .map(|(i, source)| Item {
            source: source.clone(),
            target: request.targets.get(i).cloned().flatten(),
            status: "queued".into(),
            bytes: 0,
            output: None,
            error: None,
        })
        .collect();
    registry.insert(
        0,
        Job {
            operation: Operation {
                id: id.clone(),
                kind: request.kind.clone(),
                status: "queued".into(),
                started: now(),
                finished: None,
                items,
                error: None,
            },
            cancel: cancel.clone(),
        },
    );
    registry.truncate(50);
    drop(registry);
    save_history();
    let task_id = id.clone();
    std::thread::spawn(move || {
        let result = execute(&task_id, &request, &cancel);
        update(&task_id, |op| {
            op.finished = Some(now());
            op.status = if cancel.load(Ordering::Relaxed) {
                "cancelled"
            } else if result.is_ok() {
                "completed"
            } else {
                "failed"
            }
            .into();
            op.error = result.err();
            for item in &mut op.items {
                if item.status == "queued" {
                    item.status = if cancel.load(Ordering::Relaxed) {
                        "cancelled"
                    } else {
                        "notStarted"
                    }
                    .into();
                }
            }
        });
        save_history();
    });
    Ok(id)
}

fn execute(id: &str, r: &Request, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK
        .try_lock()
        .map_err(|_| "Another database operation is in progress")?;
    prepare_mysql_client()?;
    update(id, |op| op.status = "running".into());
    let temp = crate::utils::paths::user_tmp_dir().join(format!("database-{id}"));
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    struct Cleanup(PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(temp.clone());
    let destination = if r.kind == "backup" || r.kind == "serverBackup" {
        user_backups_dir().join("mysql")
    } else if r.kind == "export" {
        PathBuf::from(r.destination.as_ref().ok_or("Choose an export folder")?)
    } else {
        temp.clone()
    };
    if !destination.is_absolute() {
        return Err("Destination must be an absolute folder".into());
    }
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
    let metadata = run_mysql_query("SELECT VERSION(), @@version_comment;")?;
    let mut package_entries = Vec::new();
    for (index, source) in r.sources.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled. Earlier database changes are not rolled back.".into());
        }
        update(id, |op| op.items[index].status = "running".into());
        save_history();
        let result = if r.kind == "import" {
            import_item(
                id,
                index,
                source,
                r.targets[index].as_deref(),
                &temp,
                cancel,
            )
            .map(|_| None)
        } else {
            export_item(id, index, source, r, &destination, &temp, cancel, &metadata).map(
                |record| {
                    package_entries.push(record.clone());
                    if r.format == "zip" {
                        None
                    } else {
                        Some(record.path)
                    }
                },
            )
        };
        match result {
            Ok(output) => update(id, |op| {
                op.items[index].status = "completed".into();
                op.items[index].output = output;
            }),
            Err(error) => {
                update(id, |op| {
                    op.items[index].status = if cancel.load(Ordering::Relaxed) {
                        "cancelled"
                    } else {
                        "failed"
                    }
                    .into();
                    op.items[index].error = Some(error.clone());
                });
                return Err(error);
            }
        }
        save_history();
    }
    if r.format == "zip" && r.kind != "import" {
        let path = destination.join(format!("devstackbox-{id}.zip"));
        if let Err(error) = write_package(&path, &package_entries, cancel) {
            update(id, |op| {
                for item in &mut op.items {
                    item.status = "failed".into();
                    item.error = Some(
                        "Package was not published. Export the selected databases again.".into(),
                    );
                }
            });
            return Err(error);
        }
        update(id, |op| {
            for item in &mut op.items {
                item.output = Some(path.display().to_string());
            }
        });
    }
    Ok(())
}

fn run_process(
    mut command: Command,
    output: Option<File>,
    id: &str,
    index: usize,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    command.stderr(Stdio::piped());
    command.stdout(if output.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let mut stderr = child.stderr.take().expect("piped stderr");
    let error_reader = std::thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        while matches!(stderr.read(&mut buffer), Ok(n) if n > 0) {}
    });
    let bytes = Arc::new(AtomicU64::new(0));
    let worker_bytes = bytes.clone();
    let write_failed = Arc::new(AtomicBool::new(false));
    let worker_failed = write_failed.clone();
    let writer = output.map(|mut file| {
        let mut stdout = child.stdout.take().expect("piped stdout");
        std::thread::spawn(move || -> std::io::Result<()> {
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let n = stdout.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                if let Err(error) = file.write_all(&buffer[..n]) {
                    worker_failed.store(true, Ordering::Relaxed);
                    return Err(error);
                }
                worker_bytes.fetch_add(n as u64, Ordering::Relaxed);
            }
            file.flush()?;
            file.sync_all()
        })
    });
    let status = loop {
        if cancel.load(Ordering::Relaxed) || write_failed.load(Ordering::Relaxed) {
            let _ = child.kill();
        }
        update(id, |op| {
            op.items[index].bytes = bytes.load(Ordering::Relaxed)
        });
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(e);
            }
        }
        std::thread::sleep(Duration::from_millis(150));
    };
    let written = writer
        .map(|w| {
            w.join()
                .map_err(|_| "Output worker failed".to_string())
                .and_then(|r| r.map_err(|e| e.to_string()))
        })
        .unwrap_or(Ok(()));
    let _ = error_reader.join();
    if cancel.load(Ordering::Relaxed) {
        return Err("Cancelled; imports may already have changed the database.".into());
    }
    written?;
    if !status.map_err(|e| e.to_string())?.success() {
        return Err("MySQL operation failed. Check file compatibility, permissions and free disk space. Imports may have partially applied; SQL diagnostics are omitted to protect sensitive data.".into());
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: String,
    pub database: String,
    pub path: String,
    pub created: u64,
    pub size: u64,
    pub checksum: String,
    pub engine: String,
    pub content: String,
    pub charset: String,
    pub collation: String,
    pub objects: Vec<String>,
    pub integrity: String,
    #[serde(default)]
    pub server_scope: bool,
}
fn record_dir() -> PathBuf {
    user_backups_dir().join("mysql-records")
}
fn checksum(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut chunk = [0_u8; 64 * 1024];
    loop {
        let n = file.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&chunk[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn export_item(
    id: &str,
    index: usize,
    db: &str,
    r: &Request,
    destination: &Path,
    temp: &Path,
    cancel: &Arc<AtomicBool>,
    engine: &str,
) -> Result<BackupRecord, String> {
    let mut command = mysqldump_command()?;
    command.args([
        "--single-transaction",
        "--quick",
        "--hex-blob",
        "--set-gtid-purged=OFF",
    ]);
    if r.content != "data" {
        command.args(["--routines", "--events", "--triggers"]);
    } else {
        command.args(["--no-create-info", "--skip-triggers"]);
    }
    if r.content == "structure" {
        command.arg("--no-data");
    }
    // Portable files omit CREATE DATABASE / USE; original schema-qualified SQL can still exist.
    if r.kind == "serverBackup" {
        command.arg("--all-databases");
    } else {
        command.arg(db);
    }
    let sql = temp.join(format!("{index}.sql"));
    run_process(
        command,
        Some(File::create(&sql).map_err(|e| e.to_string())?),
        id,
        index,
        cancel,
    )?;
    let extension = if r.format == "gzip" { "sql.gz" } else { "sql" };
    let output = destination.join(format!("{db}-{id}.{extension}"));
    let staged = if r.format == "gzip" {
        let compressed = temp.join(format!("{index}.sql.gz"));
        let mut encoder = flate2::write::GzEncoder::new(
            File::create(&compressed).map_err(|e| e.to_string())?,
            flate2::Compression::default(),
        );
        copy_bounded(
            File::open(&sql).map_err(|e| e.to_string())?,
            &mut encoder,
            MAX_BYTES,
            cancel,
        )?;
        encoder
            .finish()
            .map_err(|e| e.to_string())?
            .sync_all()
            .map_err(|e| e.to_string())?;
        compressed
    } else {
        sql
    };
    let output = if r.format == "zip" {
        staged
    } else {
        publish(&staged, &output, cancel)?;
        output
    };
    let schema = run_mysql_query(&format!("SELECT DEFAULT_CHARACTER_SET_NAME,DEFAULT_COLLATION_NAME FROM information_schema.schemata WHERE SCHEMA_NAME='{}';", escape_mysql_string_literal(db)))?;
    let parts: Vec<_> = schema.trim().split('\t').collect();
    let record = BackupRecord {
        id: format!("{id}-{index}"),
        database: db.into(),
        path: output.display().to_string(),
        created: now(),
        size: fs::metadata(&output).map_err(|e| e.to_string())?.len(),
        checksum: checksum(&output)?,
        engine: engine.trim().into(),
        content: r.content.clone(),
        charset: parts.first().unwrap_or(&"").to_string(),
        collation: parts.get(1).unwrap_or(&"").to_string(),
        objects: if r.content == "data" {
            vec!["table data".into()]
        } else {
            vec![
                "tables".into(),
                "views".into(),
                "triggers".into(),
                "routines".into(),
                "events".into(),
            ]
        },
        integrity: "notChecked".into(),
        server_scope: r.kind == "serverBackup",
    };
    if (r.kind == "backup" || r.kind == "serverBackup") && r.format != "zip" {
        fs::create_dir_all(record_dir()).map_err(|e| e.to_string())?;
        fs::write(
            record_dir().join(format!("{}.json", record.id)),
            serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Backup file exists, but its record could not be saved: {e}"))?;
    }
    Ok(record)
}
fn publish(source: &Path, output: &Path, cancel: &AtomicBool) -> Result<(), String> {
    let partial = output.with_extension(format!("{}.partial", unique_suffix()));
    let result = (|| {
        let mut dest = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&partial)
            .map_err(|e| e.to_string())?;
        copy_bounded(
            File::open(source).map_err(|e| e.to_string())?,
            &mut dest,
            MAX_BYTES,
            cancel,
        )?;
        dest.sync_all().map_err(|e| e.to_string())?;
        drop(dest);
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled before publishing output".into());
        }
        fs::hard_link(&partial, output)
            .map_err(|e| format!("Could not publish file without overwriting existing data: {e}"))
    })();
    let _ = fs::remove_file(partial);
    result
}
fn copy_bounded(
    mut input: impl Read,
    mut output: impl Write,
    maximum: u64,
    cancel: &AtomicBool,
) -> Result<u64, String> {
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled".into());
        }
        let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(total);
        }
        total += n as u64;
        if total > maximum {
            return Err("Expanded input exceeds the supported size limit".into());
        }
        output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    version: u32,
    databases: Vec<BackupRecord>,
}
fn write_package(path: &Path, records: &[BackupRecord], cancel: &AtomicBool) -> Result<(), String> {
    let staged = path.with_extension(format!("{}.partial", unique_suffix()));
    let result = (|| {
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staged)
            .map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let mut entries = records.to_vec();
        for (i, record) in entries.iter_mut().enumerate() {
            let entry = format!("database-{i}.sql");
            zip.start_file(&entry, options).map_err(|e| e.to_string())?;
            copy_bounded(
                File::open(&record.path).map_err(|e| e.to_string())?,
                &mut zip,
                MAX_BYTES,
                cancel,
            )?;
            record.path = entry;
        }
        zip.start_file("manifest.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(
            &serde_json::to_vec_pretty(&Manifest {
                version: 1,
                databases: entries,
            })
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        zip.finish()
            .map_err(|e| e.to_string())?
            .sync_all()
            .map_err(|e| e.to_string())?;
        fs::hard_link(&staged, path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = fs::remove_file(staged);
    result
}
fn unpack(path: &Path, temp: &Path, cancel: &AtomicBool) -> Result<Vec<BackupRecord>, String> {
    let mut zip = zip::ZipArchive::new(File::open(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if zip.len() > MAX_ITEMS + 1 {
        return Err("Package contains too many entries".into());
    }
    let mut names = HashSet::new();
    let mut total = 0_u64;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name();
        if name.contains(['/', '\\', ':'])
            || name == ".."
            || !names.insert(name.to_lowercase())
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
            || !(name == "manifest.json" || name.ends_with(".sql"))
        {
            return Err("Unsupported or unsafe package entry".into());
        }
        total = total.checked_add(entry.size()).ok_or("Package too large")?;
        if total > MAX_BYTES || entry.size() > entry.compressed_size().max(1).saturating_mul(1000) {
            return Err("Package exceeds expansion limits".into());
        }
    }
    let mut manifest_bytes = Vec::new();
    zip.by_name("manifest.json")
        .map_err(|_| "Missing DevStackBox manifest")?
        .take(1_000_001)
        .read_to_end(&mut manifest_bytes)
        .map_err(|e| e.to_string())?;
    if manifest_bytes.len() > 1_000_000 {
        return Err("Manifest too large".into());
    }
    let mut manifest: Manifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| "Invalid DevStackBox manifest")?;
    if manifest.version != 1
        || manifest.databases.is_empty()
        || manifest.databases.len() + 1 != zip.len()
    {
        return Err("Unsupported or incomplete package".into());
    }
    let mut targets = HashSet::new();
    let mut files = HashSet::new();
    for record in &mut manifest.databases {
        validate_database_name(&record.database)?;
        ensure_user_database(&record.database)?;
        if !targets.insert(record.database.to_lowercase())
            || !files.insert(record.path.clone())
            || record.path.contains(['/', '\\', ':'])
            || !record.path.ends_with(".sql")
        {
            return Err("Duplicate or invalid package target".into());
        }
        let output = temp.join(&record.path);
        let entry = zip
            .by_name(&record.path)
            .map_err(|_| "Missing package SQL")?;
        let bytes = copy_bounded(
            entry,
            File::create(&output).map_err(|e| e.to_string())?,
            MAX_BYTES,
            cancel,
        )?;
        if bytes != record.size || checksum(&output)? != record.checksum {
            return Err("Package file integrity check failed".into());
        }
        record.path = output.display().to_string();
    }
    Ok(manifest.databases)
}
fn import_item(
    id: &str,
    index: usize,
    source: &str,
    target: Option<&str>,
    temp: &Path,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let path = validate_input(source)?;
    if source.to_lowercase().ends_with(".zip") {
        if target.is_some() {
            return Err(
                "Packages restore their original database names; import a package individually"
                    .into(),
            );
        }
        let records = unpack(&path, temp, cancel)?;
        for record in records {
            import_sql(
                id,
                index,
                Path::new(&record.path),
                Some(&record.database),
                cancel,
            )?;
        }
        return Ok(());
    }
    let path = if source.to_lowercase().ends_with(".gz") {
        let output = temp.join(format!("import-{index}.sql"));
        let input =
            flate2::read::MultiGzDecoder::new(File::open(&path).map_err(|e| e.to_string())?);
        copy_bounded(
            input,
            File::create(&output).map_err(|e| e.to_string())?,
            MAX_BYTES,
            cancel,
        )?;
        output
    } else {
        path
    };
    import_sql(id, index, &path, target, cancel)
}
fn import_sql(
    id: &str,
    index: usize,
    path: &Path,
    target: Option<&str>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Cancelled".into());
    }
    let mut cmd = mysql_command()?;
    if let Some(db) = target {
        let db = validate_database_name(db)?;
        ensure_user_database(&db)?;
        run_mysql_query(&format!("CREATE DATABASE IF NOT EXISTS `{db}`;"))?;
        cmd.arg(format!("--database={db}"));
    }
    cmd.arg("--binary-mode")
        .stdin(Stdio::from(File::open(path).map_err(|e| e.to_string())?));
    run_process(cmd, None, id, index, cancel)
}

#[tauri::command]
pub async fn pick_database_files() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .add_filter("Database files", &["sql", "gz", "zip"])
            .pick_files()
            .unwrap_or_default()
            .iter()
            .map(|p| p.display().to_string())
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn pick_database_destination() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .pick_folder()
            .map(|p| p.display().to_string())
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn inspect_database_files(paths: Vec<String>) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
    if paths.is_empty() || paths.len() > MAX_ITEMS { return Err("Choose between 1 and 100 files".into()); }
    let temp = crate::utils::paths::user_tmp_dir().join(format!("inspect-{}", unique_suffix())); fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let result = (|| { let mut result = Vec::new(); for path in paths { let input = validate_input(&path)?; let size = fs::metadata(&input).map_err(|e|e.to_string())?.len(); let records = if path.to_lowercase().ends_with(".zip") { unpack(&input, &temp, &AtomicBool::new(false))? } else { vec![] }; result.push(serde_json::json!({"file":path,"size":size,"databases":records.iter().map(|r|&r.database).collect::<Vec<_>>(),"engine":records.iter().map(|r|&r.engine).collect::<Vec<_>>(),"warning":"SQL can modify databases beyond the selected initial target. Review trusted files only. Version, collation and object compatibility are not guaranteed; integrity checking does not verify restorability."})); } Ok(result) })();
    let _ = fs::remove_dir_all(temp); result
}).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn database_collations() -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(|| { let rows = run_mysql_query("SELECT CHARACTER_SET_NAME,COLLATION_NAME,IS_DEFAULT FROM information_schema.collations ORDER BY CHARACTER_SET_NAME,COLLATION_NAME;")?; Ok(rows.lines().map(|line| { let parts: Vec<_> = line.split('\t').collect(); serde_json::json!({"charset":parts.first().unwrap_or(&""),"collation":parts.get(1).unwrap_or(&""),"isDefault":parts.get(2)==Some(&"Yes")}) }).collect()) }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn create_database_with_options(
    name: String,
    charset: Option<String>,
    collation: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = super::mysql_import::MYSQL_DATA_LOCK
            .try_lock()
            .map_err(|_| "Another database operation is in progress")?;
        let name = validate_database_name(&name)?;
        ensure_user_database(&name)?;
        let mut sql = format!("CREATE DATABASE `{name}`");
        if let Some(charset) = charset {
            if !charset
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
                || charset.is_empty()
            {
                return Err("Invalid character set".into());
            }
            sql.push_str(&format!(" CHARACTER SET {charset}"));
        }
        if let Some(collation) = collation {
            if !collation
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
                || collation.is_empty()
            {
                return Err("Invalid collation".into());
            }
            sql.push_str(&format!(" COLLATE {collation}"));
        }
        sql.push(';');
        run_mysql_query(&sql)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn database_backups() -> Result<Vec<BackupRecord>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut records = Vec::new();
        if let Ok(entries) = fs::read_dir(record_dir()) {
            for entry in entries.flatten() {
                if let Ok(bytes) = fs::read(entry.path()) {
                    if let Ok(mut record) = serde_json::from_slice::<BackupRecord>(&bytes) {
                        record.integrity = if Path::new(&record.path).is_file() {
                            "notChecked"
                        } else {
                            "missing"
                        }
                        .into();
                        records.push(record);
                    }
                }
            }
        }
        records.sort_by_key(|r| std::cmp::Reverse(r.created));
        Ok(records)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn read_record(id: &str) -> Result<BackupRecord, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Invalid backup ID".into());
    }
    serde_json::from_slice(
        &fs::read(record_dir().join(format!("{id}.json"))).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn verify_database_backup(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let record = read_record(&id)?;
        if checksum(Path::new(&record.path))? == record.checksum {
            Ok("integrityPassed".into())
        } else {
            Ok("checksumMismatch".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn delete_database_backup(id: String) -> Result<(), String> {
    let _lock = super::mysql_import::MYSQL_DATA_LOCK
        .try_lock()
        .map_err(|_| "Wait for database operations to finish")?;
    let record = read_record(&id)?;
    let parent = fs::canonicalize(user_backups_dir().join("mysql")).map_err(|e| e.to_string())?;
    let path = Path::new(&record.path);
    if path.exists() {
        let resolved = fs::canonicalize(path).map_err(|e| e.to_string())?;
        if resolved.parent() != Some(parent.as_path()) {
            return Err("Backup is outside the managed backup folder".into());
        }
        fs::remove_file(resolved).map_err(|e| e.to_string())?;
    }
    fs::remove_file(record_dir().join(format!("{id}.json"))).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn database_details(name: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = validate_database_name(&name)?;
        ensure_user_database(&name)?;
        let literal = escape_mysql_string_literal(&name);
        let schema = run_mysql_query(&format!("SELECT DEFAULT_CHARACTER_SET_NAME,DEFAULT_COLLATION_NAME FROM information_schema.schemata WHERE SCHEMA_NAME='{literal}';"))?;
        if schema.trim().is_empty() { return Err("Database no longer exists".into()); }
        let rows = run_mysql_query(&format!("SELECT TABLE_NAME,TABLE_TYPE,IFNULL(ENGINE,''),IFNULL(TABLE_ROWS,0),IFNULL(DATA_LENGTH+INDEX_LENGTH,0) FROM information_schema.tables WHERE TABLE_SCHEMA='{literal}' ORDER BY TABLE_NAME;"))?;
        let objects: Vec<_> = rows.lines().map(|line| {
            let p: Vec<_> = line.split('\t').collect();
            serde_json::json!({"name":p.first().unwrap_or(&""),"kind":p.get(1).unwrap_or(&""),"engine":p.get(2).unwrap_or(&""),"rows":p.get(3).and_then(|s|s.parse::<u64>().ok()).unwrap_or(0),"size":p.get(4).and_then(|s|s.parse::<u64>().ok()).unwrap_or(0)})
        }).collect();
        let escaped_scope = literal.replace('_', "\\_");
        let grants = run_mysql_query(&format!("SELECT GRANTEE,TABLE_SCHEMA,PRIVILEGE_TYPE FROM information_schema.schema_privileges WHERE TABLE_SCHEMA IN ('{literal}','{escaped_scope}') ORDER BY GRANTEE,PRIVILEGE_TYPE;"))?;
        let access: Vec<_> = grants.lines().map(|line| { let p: Vec<_> = line.split('\t').collect(); serde_json::json!({"account":p.first().unwrap_or(&""),"scope":p.get(1).unwrap_or(&""),"privilege":p.get(2).unwrap_or(&"")}) }).collect();
        let parts: Vec<_> = schema.trim().split('\t').collect();
        Ok(serde_json::json!({"name":name,"charset":parts.first().unwrap_or(&""),"collation":parts.get(1).unwrap_or(&""),"objects":objects,"access":access}))
    }).await.map_err(|e| e.to_string())?
}

const PRIVILEGES: &[&str] = &[
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "INDEX",
    "DROP",
    "REFERENCES",
    "CREATE VIEW",
    "SHOW VIEW",
    "TRIGGER",
    "EXECUTE",
    "CREATE ROUTINE",
    "ALTER ROUTINE",
    "EVENT",
    "CREATE TEMPORARY TABLES",
    "LOCK TABLES",
];
fn database_grant_scope(database: &str) -> Result<String, String> {
    // Partial revokes can change global access; preserve that advanced policy.
    if run_mysql_query("SELECT @@GLOBAL.partial_revokes;")?.trim() != "0" {
        return Err("This server uses partial revokes. Manage permissions in phpMyAdmin; DevStackBox will not change global restrictions.".into());
    }
    Ok(database.replace('_', "\\_").replace('%', "\\%"))
}
#[tauri::command]
pub async fn database_grants(
    username: String,
    host: String,
    database: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || { let account = quote_mysql_user_host(&username, &host)?; let database = database_grant_scope(&validate_database_name(&database)?)?; let query = format!("SELECT PRIVILEGE_TYPE FROM information_schema.schema_privileges WHERE GRANTEE='{}' AND TABLE_SCHEMA='{}' ORDER BY PRIVILEGE_TYPE;", escape_mysql_string_literal(&account), escape_mysql_string_literal(&database)); Ok(run_mysql_query(&query)?.lines().map(str::to_owned).collect()) }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn set_database_grants(
    username: String,
    host: String,
    database: String,
    additions: Vec<String>,
    removals: Vec<String>,
    expected: Option<Vec<String>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = super::mysql_import::MYSQL_DATA_LOCK
            .try_lock()
            .map_err(|_| "Another database operation is in progress")?;
        if username.trim().eq_ignore_ascii_case("root") || username.starts_with("mysql.") {
            return Err("Administrative and system account permissions are protected".into());
        }
        let account = quote_mysql_user_host(&username, &host)?;
        let database = validate_database_name(&database)?;
        ensure_user_database(&database)?;
        let database = database_grant_scope(&database)?;
        if let Some(mut expected) = expected {
            let query = format!("SELECT PRIVILEGE_TYPE FROM information_schema.schema_privileges WHERE GRANTEE='{}' AND TABLE_SCHEMA='{}' ORDER BY PRIVILEGE_TYPE;", escape_mysql_string_literal(&account), escape_mysql_string_literal(&database));
            let mut current: Vec<String> = run_mysql_query(&query)?.lines().map(str::to_owned).collect();
            expected.sort(); current.sort();
            if expected != current { return Err("Permissions changed since your review. Reopen the editor and review the current grants.".into()); }
        }
        for p in additions.iter().chain(removals.iter()) {
            if !PRIVILEGES.contains(&p.as_str()) {
                return Err("Unsupported privilege".into());
            }
        }
        if additions.iter().any(|p| removals.contains(p)) {
            return Err("Conflicting permission changes".into());
        }
        let mut sql = String::new();
        if !additions.is_empty() {
            sql.push_str(&format!(
                "GRANT {} ON `{database}`.* TO {account};",
                additions.join(",")
            ));
        }
        if !removals.is_empty() {
            sql.push_str(&format!(
                "REVOKE {} ON `{database}`.* FROM {account};",
                removals.join(",")
            ));
        }
        if !sql.is_empty() {
            run_mysql_query(&sql).map_err(|e| {
                format!("Permissions may be partially updated. Refresh before retrying. {e}")
            })?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Request {
        Request {
            kind: "export".into(),
            sources: vec!["example".into()],
            targets: vec![],
            format: "sql".into(),
            content: "all".into(),
            destination: None,
            reviewed: false,
        }
    }
    #[test]
    fn rejects_protected_and_duplicate_export_sources() {
        let mut r = request();
        r.sources = vec!["MYSQL".into()];
        assert!(validate_request(&r).is_err());
        r.sources = vec!["app".into(), "APP".into()];
        assert!(validate_request(&r).is_err());
    }
    #[test]
    fn rejects_invalid_modes() {
        let mut r = request();
        r.content = "anything".into();
        assert!(validate_request(&r).is_err());
    }
    #[test]
    fn bounded_copy_stops_expansion_and_cancel() {
        let cancel = AtomicBool::new(false);
        assert!(copy_bounded(&b"12345"[..], Vec::new(), 4, &cancel).is_err());
        cancel.store(true, Ordering::Relaxed);
        assert!(copy_bounded(&b"a"[..], Vec::new(), 10, &cancel).is_err());
    }
    #[test]
    fn publish_preserves_existing_file_and_cleans_partial_output() {
        let dir = std::env::temp_dir().join(format!("dsb-publish-{}", unique_suffix()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.sql");
        let destination = dir.join("backup.sql");
        fs::write(&source, b"new").unwrap();
        fs::write(&destination, b"existing backup").unwrap();
        assert!(publish(&source, &destination, &AtomicBool::new(false)).is_err());
        assert_eq!(fs::read(&destination).unwrap(), b"existing backup");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    #[ignore = "Requires scripts/test-database-workspace.ps1 disposable MySQL profile"]
    fn native_workspace_round_trip() {
        let root = crate::utils::paths::get_user_data_root();
        assert!(
            root.join("database-workspace-test-profile").is_file(),
            "Refusing to test a non-disposable profile"
        );
        assert_ne!(crate::utils::config_ports::mysql_port(), 3306);
        prepare_mysql_client().unwrap();
        run_mysql_query("CREATE DATABASE dw_test; USE dw_test; CREATE TABLE records(id INT PRIMARY KEY, label VARCHAR(80)); INSERT INTO records VALUES(1,'hello'),(2,'नमस्ते'); CREATE VIEW record_view AS SELECT * FROM records; CREATE TRIGGER record_before BEFORE INSERT ON records FOR EACH ROW SET NEW.label=UPPER(NEW.label); CREATE PROCEDURE record_count() SELECT COUNT(*) FROM records; CREATE EVENT record_event ON SCHEDULE EVERY 1 DAY DISABLE DO SELECT 1;").unwrap();
        let temp = root.join("round-trip");
        fs::create_dir_all(&temp).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let mut request = request();
        request.sources = vec!["dw_test".into()];
        request.kind = "backup".into();
        let engine = run_mysql_query("SELECT VERSION();").unwrap();
        let mut server_request = request.clone();
        server_request.kind = "serverBackup".into();
        server_request.sources = vec!["server".into()];
        server_request.reviewed = true;
        validate_request(&server_request).unwrap();
        let server_record = export_item(
            "server-test",
            0,
            "server",
            &server_request,
            &temp,
            &temp,
            &cancel,
            &engine,
        )
        .unwrap();
        assert!(server_record.server_scope);
        assert!(fs::read_to_string(&server_record.path)
            .unwrap()
            .contains("CREATE DATABASE"));
        let record = export_item(
            "native-test",
            0,
            "dw_test",
            &request,
            &temp,
            &temp,
            &cancel,
            &engine,
        )
        .unwrap();
        let sql = fs::read_to_string(&record.path).unwrap();
        for object in [
            "record_view",
            "record_before",
            "record_count",
            "record_event",
        ] {
            assert!(sql.contains(object), "Missing {object}");
        }
        run_mysql_query("DROP DATABASE dw_test; CREATE DATABASE dw_test;").unwrap();
        import_sql(
            "native-test",
            0,
            Path::new(&record.path),
            Some("dw_test"),
            &cancel,
        )
        .unwrap();
        assert_eq!(
            run_mysql_query("SELECT COUNT(*) FROM dw_test.records;")
                .unwrap()
                .trim(),
            "2"
        );
        assert_eq!(
            run_mysql_query(
                "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='dw_test';"
            )
            .unwrap()
            .trim(),
            "1"
        );
        assert_eq!(
            run_mysql_query(
                "SELECT COUNT(*) FROM information_schema.events WHERE event_schema='dw_test';"
            )
            .unwrap()
            .trim(),
            "1"
        );
        let package = temp.join("round-trip.zip");
        write_package(&package, &[record.clone()], &cancel).unwrap();
        let unpacked_dir = temp.join("unpacked");
        fs::create_dir_all(&unpacked_dir).unwrap();
        let unpacked = unpack(&package, &unpacked_dir, &cancel).unwrap();
        assert_eq!(unpacked[0].checksum, record.checksum);
        let protected = temp.join("traversal.zip");
        let mut zip = zip::ZipWriter::new(File::create(&protected).unwrap());
        zip.start_file("../outside.sql", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"SELECT 1;").unwrap();
        zip.finish().unwrap();
        assert!(unpack(&protected, &unpacked_dir, &cancel).is_err());
        request.format = "gzip".into();
        let compressed = export_item(
            "gzip-test",
            0,
            "dw_test",
            &request,
            &temp,
            &temp,
            &cancel,
            &engine,
        )
        .unwrap();
        run_mysql_query("DROP DATABASE dw_test; CREATE DATABASE dw_test;").unwrap();
        import_item(
            "gzip-test",
            0,
            &compressed.path,
            Some("dw_test"),
            &temp,
            &cancel,
        )
        .unwrap();
        assert_eq!(
            run_mysql_query("SELECT COUNT(*) FROM dw_test.records;")
                .unwrap()
                .trim(),
            "2"
        );
        // Password SQL uses stdin, works independently of backslash SQL mode, and isn't echoed on failure.
        run_mysql_query("CREATE USER 'dw_user'@'localhost' IDENTIFIED BY 'a\\b''c#123';").unwrap();
        tauri::async_runtime::block_on(set_database_grants(
            "dw_user".into(),
            "localhost".into(),
            "dw_test".into(),
            vec!["SELECT".into()],
            vec![],
            Some(vec![]),
        ))
        .unwrap();
        let grants = tauri::async_runtime::block_on(database_grants(
            "dw_user".into(),
            "localhost".into(),
            "dw_test".into(),
        ))
        .unwrap();
        assert_eq!(grants, vec!["SELECT"]);
        run_mysql_query("CREATE DATABASE dwXtest; CREATE TABLE dwXtest.records(id INT);").unwrap();
        let mut restricted = mysql_command().unwrap();
        restricted
            .arg("--user=dw_user")
            .env("MYSQL_PWD", "a\\b'c#123");
        assert!(
            crate::utils::database_io::query(restricted, "SELECT * FROM dwXtest.records;").is_err()
        );
        let mut restricted = mysql_command().unwrap();
        restricted
            .arg("--user=dw_user")
            .env("MYSQL_PWD", "a\\b'c#123");
        assert_eq!(
            crate::utils::database_io::query(restricted, "SELECT COUNT(*) FROM dw_test.records;")
                .unwrap()
                .trim(),
            "2"
        );
        assert!(run_mysql_query("THIS IS INVALID 'test-secret';")
            .unwrap_err()
            .find("test-secret")
            .is_none());
        let failure = temp.join("partial.sql");
        fs::write(
            &failure,
            "USE dw_test; INSERT INTO records VALUES(3,'partial'); THIS IS INVALID;",
        )
        .unwrap();
        assert!(import_sql("failure", 0, &failure, Some("dw_test"), &cancel).is_err());
        assert_eq!(
            run_mysql_query("SELECT COUNT(*) FROM dw_test.records;")
                .unwrap()
                .trim(),
            "3"
        );
        let good = temp.join("batch-good.sql");
        let bad = temp.join("batch-bad.sql");
        let pending = temp.join("batch-pending.sql");
        fs::write(&good, "CREATE TABLE completed(id INT);").unwrap();
        fs::write(&bad, "CREATE TABLE partial(id INT); INVALID SQL;").unwrap();
        fs::write(&pending, "CREATE TABLE never_started(id INT);").unwrap();
        let batch = Request {
            kind: "import".into(),
            sources: vec![
                good.display().to_string(),
                bad.display().to_string(),
                pending.display().to_string(),
            ],
            targets: vec![
                Some("batch_success".into()),
                Some("batch_failure".into()),
                Some("batch_pending".into()),
            ],
            format: "sql".into(),
            content: "all".into(),
            destination: None,
            reviewed: true,
        };
        let batch_id = start_database_operation(batch).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        loop {
            let op = database_operations()
                .unwrap()
                .into_iter()
                .find(|op| op.id == batch_id)
                .unwrap();
            if !["queued", "running"].contains(&op.status.as_str()) {
                assert_eq!(op.status, "failed");
                assert_eq!(
                    op.items
                        .iter()
                        .map(|i| i.status.as_str())
                        .collect::<Vec<_>>(),
                    vec!["completed", "failed", "notStarted"]
                );
                break;
            }
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(100));
        }
        assert_eq!(run_mysql_query("SELECT COUNT(*) FROM information_schema.schemata WHERE SCHEMA_NAME='batch_pending';").unwrap().trim(),"0");
        run_mysql_query("DROP DATABASE batch_success; DROP DATABASE batch_failure;").unwrap();
        let slow = temp.join("cancel.sql");
        fs::write(&slow, "SELECT SLEEP(30);").unwrap();
        let cancel_worker = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            cancel_worker.store(true, Ordering::Relaxed);
        });
        let start = std::time::Instant::now();
        assert!(import_sql("cancel", 0, &slow, Some("dw_test"), &cancel).is_err());
        assert!(start.elapsed() < Duration::from_secs(10));
        run_mysql_query(
            "DROP USER 'dw_user'@'localhost'; DROP DATABASE dw_test; DROP DATABASE dwXtest;",
        )
        .unwrap();
    }
}

pub fn has_active_database_operation() -> bool {
    super::mysql_import::MYSQL_DATA_LOCK.is_busy()
        || jobs()
            .lock()
            .map(|jobs| {
                jobs.iter()
                    .any(|j| ["queued", "running"].contains(&j.operation.status.as_str()))
            })
            .unwrap_or(true)
}
