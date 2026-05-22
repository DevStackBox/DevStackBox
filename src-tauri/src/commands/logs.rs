// Service log commands.

use crate::utils::paths::user_logs_dir;
use std::io::Write;

#[tauri::command]
pub async fn get_service_logs(service: String) -> Result<String, String> {
    let logs_dir = user_logs_dir();

    let log_file = match service.as_str() {
        "mysql" => logs_dir.join("mysql.log"),
        "apache" | "httpd" => logs_dir.join("error.log"),
        "php" => logs_dir.join("php_error.log"),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    if !log_file.exists() {
        return Ok(format!(
            "Log file for {} not found yet. Start the service to generate logs.",
            service
        ));
    }

    match std::fs::read_to_string(&log_file) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 1000 { lines.len() - 1000 } else { 0 };
            let last_lines = lines[start..].join("\n");

            if last_lines.is_empty() {
                Ok(format!("{} log file is empty", service))
            } else {
                Ok(last_lines)
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
