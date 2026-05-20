// Service log commands.

use crate::utils::paths::user_logs_dir;

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
