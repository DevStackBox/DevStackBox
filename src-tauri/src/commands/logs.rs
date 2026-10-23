// Service log commands.

use crate::utils::paths::user_logs_dir;
use std::io::{Read, Seek, SeekFrom, Write};

fn log_filename(service: &str, php_version: Option<&str>) -> Result<String, String> {
    match (service, php_version) {
        ("php", Some(version)) if matches!(version, "8.1" | "8.2" | "8.3" | "8.4" | "8.5") => Ok(format!("php-{version}-error.log")),
        (_, Some(_)) => Err("PHP log version must be a supported branch and used with PHP logs".into()),
        ("php", None) => Ok("php_error.log".into()),
        ("apache" | "httpd", None) => Ok("error.log".into()),
        ("mysql", None) => Ok("mysql.log".into()),
        _ => Err(format!("Unknown service: {service}")),
    }
}

#[tauri::command]
pub async fn get_service_logs(service: String, php_version: Option<String>) -> Result<String, String> {
    let logs_dir = user_logs_dir();

    let log_file = logs_dir.join(log_filename(&service, php_version.as_deref())?);

    if !log_file.exists() {
        return Ok(format!("No {} log file has been written yet.", service));
    }

    let tail = (|| -> std::io::Result<String> {
        let mut file = std::fs::File::open(&log_file)?;
        let size = file.metadata()?.len();
        file.seek(SeekFrom::Start(size.saturating_sub(512 * 1024)))?;
        let mut bytes = Vec::new(); file.read_to_end(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    })();
    match tail {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 1000 { lines.len() - 1000 } else { 0 };
            let last_lines = lines[start..].join("\n");

            if last_lines.is_empty() {
                Ok(format!("{} log file is empty", service))
            } else {
                Ok(format!("Log file: {}\n{}", log_file.display(), last_lines))
            }
        }
        Err(e) => Err(format!("Failed to read {} logs: {}", service, e)),
    }
}

/// Append a crash event entry to `logs/crash.log`.
/// `timestamp` is an ISO 8601 string supplied by the frontend (e.g. `new Date().toISOString()`).
/// `service` is the service name ("apache", "mysql", "php").
#[tauri::command]
pub async fn log_crash_event(service: String, timestamp: String) -> Result<(), String> {
    // Basic validation: reject empty or suspiciously long inputs.
    if service.is_empty() || service.len() > 64 || timestamp.is_empty() || timestamp.len() > 64 {
        return Err("Invalid service or timestamp".to_string());
    }
    // Allow only safe characters to avoid log injection.
    if !service.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid service name".to_string());
    }

    let logs_dir = user_logs_dir();
    std::fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;
    let crash_log = logs_dir.join("crash.log");

    let entry = format!("{} [CRASH] {} stopped unexpectedly\n", timestamp, service);

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&crash_log)
        .map_err(|e| format!("Failed to open crash.log: {}", e))?;

    file.write_all(entry.as_bytes())
        .map_err(|e| format!("Failed to write crash.log: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::log_filename;
    #[test]
    fn routes_pinned_logs_without_accepting_paths() {
        assert_eq!(log_filename("php", Some("8.3")).unwrap(), "php-8.3-error.log");
        assert_eq!(log_filename("php", None).unwrap(), "php_error.log");
        assert!(log_filename("php", Some("../../secret")).is_err());
        assert!(log_filename("apache", Some("8.3")).is_err());
    }
}
