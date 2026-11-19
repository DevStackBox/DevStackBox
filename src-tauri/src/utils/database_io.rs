//! Bounded process IO and publish-on-success files shared by database operations.
use std::io::{Read, Write};
use std::path::Path;
use crate::utils::mysql_process::{Command, Stdio, Child};

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
    let result = wait_bounded(child, std::time::Duration::from_secs(30), 8 * 1024 * 1024, None);
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

/// Drain both pipes concurrently; terminate and reap on cancellation, deadline or output overflow.
pub fn wait_bounded(mut child: Child, timeout: std::time::Duration, limit: usize, cancel: Option<&std::sync::atomic::AtomicBool>) -> Result<std::process::Output, String> {
    use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
    let overflow = Arc::new(AtomicBool::new(false));
    fn reader(pipe: Option<impl Read + Send + 'static>, limit: usize, overflow: Arc<AtomicBool>) -> std::thread::JoinHandle<std::io::Result<Vec<u8>>> {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(mut pipe) = pipe {
                let mut chunk = [0; 8192];
                loop {
                    let n = pipe.read(&mut chunk)?;
                    if n == 0 { break; }
                    let keep = n.min(limit.saturating_sub(bytes.len()));
                    bytes.extend_from_slice(&chunk[..keep]);
                    if keep < n { overflow.store(true, Ordering::Release); }
                }
            }
            Ok(bytes)
        })
    }
    let stdout = reader(child.stdout.take(), limit, overflow.clone());
    let stderr = reader(child.stderr.take(), 65536, overflow.clone());
    let deadline = std::time::Instant::now() + timeout;
    let result = loop {
        let reason = if cancel.is_some_and(|c| c.load(Ordering::Acquire)) { Some("Operation cancelled; imports may have partially applied") }
          else if overflow.load(Ordering::Acquire) { Some("Process output exceeded limit") }
          else if std::time::Instant::now() >= deadline { Some("Process execution timed out") } else { None };
        if let Some(reason) = reason { let _ = child.kill(); let _ = child.wait(); break Err(reason.to_string()); }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(20)),
            Err(e) => { let _ = child.kill(); let _ = child.wait(); break Err(e.to_string()); }
        }
    };
    let out = stdout.join().map_err(|_| "Output reader failed")?.map_err(|e| e.to_string())?;
    let err = stderr.join().map_err(|_| "Diagnostic reader failed")?.map_err(|e| e.to_string())?;
    let status = result?;
    if overflow.load(Ordering::Acquire) { return Err("Process output exceeded limit".into()); }
    Ok(std::process::Output { status, stdout: out, stderr: err })
}

#[cfg(all(test, windows))]
mod bounded_tests {
    use super::*;
    #[test]
    fn timeout_and_output_limit_reap_clients() {
        let mut cmd = Command::new(std::path::Path::new(&std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe"));
        cmd.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 20"]).stdout(Stdio::piped()).stderr(Stdio::piped());
        let start = std::time::Instant::now();
        assert!(wait_bounded(cmd.spawn().unwrap(), std::time::Duration::from_millis(100), 100, None).unwrap_err().contains("timed out"));
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
        let mut cmd = Command::new(std::path::Path::new(&std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe"));
        cmd.args(["-NoProfile", "-Command", "Write-Output ('x' * 10000)"]).stdout(Stdio::piped()).stderr(Stdio::piped());
        assert!(wait_bounded(cmd.spawn().unwrap(), std::time::Duration::from_secs(10), 100, None).unwrap_err().contains("limit"));
        let cancel = std::sync::atomic::AtomicBool::new(true);
        let mut cmd = Command::new(std::path::Path::new(&std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe"));
        cmd.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 20"]).stdout(Stdio::piped()).stderr(Stdio::piped());
        assert!(wait_bounded(cmd.spawn().unwrap(), std::time::Duration::from_secs(10), 100, Some(&cancel)).unwrap_err().contains("cancelled"));
    }
}
