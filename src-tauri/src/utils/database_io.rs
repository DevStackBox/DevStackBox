//! Bounded process IO and publish-on-success files shared by database operations.
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};

pub fn query(mut command: Command, sql: &str) -> Result<String, String> {
    // SQL (including account passwords) is never a process argument.
    let mut child = command
        .args(["--batch", "--skip-column-names", "--binary-mode"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start MySQL client: {e}"))?;
    let input = child.stdin.take().ok_or("MySQL input unavailable")?;
    let statement = format!("SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES';\n{sql}\n");
    let writer = std::thread::spawn(move || {
        let mut input = input;
        input.write_all(statement.as_bytes())
    });
    let result = child.wait_with_output();
    let written = writer.join().map_err(|_| "MySQL input worker failed")?;
    let output = result.map_err(|e| format!("Could not wait for MySQL: {e}"))?;
    // Server errors may echo literals. Return the numeric diagnostic only.
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = stderr
            .split_whitespace()
            .find(|word| word.chars().all(|c| c.is_ascii_digit()));
        return Err(format!("MySQL rejected the operation{}; check the account, permissions and input. Sensitive query details were omitted.", code.map(|c| format!(" (error {c})")).unwrap_or_default()));
    }
    written.map_err(|e| format!("Could not send MySQL input: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub fn dump(mut command: Command, destination: &Path) -> Result<(), String> {
    use std::fs::OpenOptions;
    let temporary = destination.with_extension(format!("{}.partial", std::process::id()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| format!("Could not create backup file: {e}"))?;
        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Could not start mysqldump: {e}"))?;
        let mut stderr = child.stderr.take().expect("piped stderr");
        let reader = std::thread::spawn(move || {
            let mut tail = Vec::new();
            let mut chunk = [0_u8; 4096];
            while let Ok(n) = stderr.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                tail.extend_from_slice(&chunk[..n]);
                if tail.len() > 8192 {
                    tail.drain(..tail.len() - 8192);
                }
            }
            tail
        });
        let copied = std::io::copy(&mut child.stdout.take().expect("piped stdout"), &mut file)
            .and_then(|_| file.flush())
            .and_then(|_| file.sync_all());
        if copied.is_err() {
            let _ = child.kill();
        }
        let status = child.wait();
        if status.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = reader.join();
        copied.map_err(|e| format!("Could not finish backup: {e}"))?;
        if !status.map_err(|e| e.to_string())?.success() {
            return Err("mysqldump failed. Check MySQL permissions and available disk space; no completed backup was published.".into());
        }
        drop(file);
        // Hard linking on the same volume publishes atomically without replacing an existing file.
        std::fs::hard_link(&temporary, destination)
            .map_err(|e| format!("Could not publish backup: {e}"))?;
        Ok(())
    })();
    let _ = std::fs::remove_file(temporary);
    result
}

pub fn unique_suffix() -> String {
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    format!(
        "{}-{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id(),
        SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}
