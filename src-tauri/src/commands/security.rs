// Security configuration analyzer.
//
// Scans PHP, MySQL, and Apache configs for common local-dev security issues
// and returns a structured list of findings with severity and recommendation.

use serde::{Deserialize, Serialize};

use crate::utils::paths::{get_installation_path, get_mysql_client_exe, user_config_dir};
use crate::utils::process::create_hidden_command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityFinding {
    pub service: String,
    pub severity: String, // "error" | "warning" | "info"
    pub title: String,
    pub description: String,
    pub recommendation: String,
}

// ── PHP checks ────────────────────────────────────────────────────────────────

fn check_php(findings: &mut Vec<SecurityFinding>) {
    let base_path = get_installation_path();
    let php_ini = base_path.join("php").join("current").join("php.ini");

    if !php_ini.exists() {
        findings.push(SecurityFinding {
            service: "php".into(),
            severity: "warning".into(),
            title: "php.ini not found".into(),
            description: "No php.ini was found at php/current/php.ini.".into(),
            recommendation: "Switch to an installed PHP version to generate php.ini.".into(),
        });
        return;
    }

    let content = match std::fs::read_to_string(&php_ini) {
        Ok(c) => c,
        Err(_) => return,
    };

    let get_value = |key: &str| -> Option<String> {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with(';') {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix(key) {
                if let Some(rest2) = rest.trim_start().strip_prefix('=') {
                    return Some(rest2.trim().to_lowercase());
                }
            }
        }
        None
    };

    // display_errors
    if get_value("display_errors").as_deref() == Some("on") {
        findings.push(SecurityFinding {
            service: "php".into(),
            severity: "warning".into(),
            title: "display_errors is On".into(),
            description: "PHP errors are displayed in browser output.".into(),
            recommendation: "Set display_errors = Off and log errors instead (log_errors = On).".into(),
        });
    }

    // expose_php
    if get_value("expose_php").as_deref() != Some("off") {
        findings.push(SecurityFinding {
            service: "php".into(),
            severity: "info".into(),
            title: "expose_php is On".into(),
            description: "PHP version is exposed in the X-Powered-By HTTP header.".into(),
            recommendation: "Set expose_php = Off in php.ini.".into(),
        });
    }

    // allow_url_include
    if get_value("allow_url_include").as_deref() == Some("on") {
        findings.push(SecurityFinding {
            service: "php".into(),
            severity: "error".into(),
            title: "allow_url_include is On".into(),
            description: "Remote file inclusion is enabled - a major security risk even locally.".into(),
            recommendation: "Set allow_url_include = Off in php.ini.".into(),
        });
    }

    // allow_url_fopen
    if get_value("allow_url_fopen").as_deref() != Some("off") {
        findings.push(SecurityFinding {
            service: "php".into(),
            severity: "info".into(),
            title: "allow_url_fopen is On".into(),
            description: "PHP can open remote URLs as files (e.g. file_get_contents with http://).".into(),
            recommendation: "Set allow_url_fopen = Off if your code does not need it.".into(),
        });
    }
}

// ── Apache checks ─────────────────────────────────────────────────────────────

fn check_apache(findings: &mut Vec<SecurityFinding>) {
    let config_dir = user_config_dir();
    let httpd_conf = config_dir.join("httpd.conf");

    if !httpd_conf.exists() {
        findings.push(SecurityFinding {
            service: "apache".into(),
            severity: "warning".into(),
            title: "httpd.conf not found".into(),
            description: "No Apache config was found in the user config directory.".into(),
            recommendation: "Start Apache at least once to auto-generate the config.".into(),
        });
        return;
    }

    let content = match std::fs::read_to_string(&httpd_conf) {
        Ok(c) => c,
        Err(_) => return,
    };

    // Directory listing
    let has_options_indexes = content.lines().any(|l| {
        let t = l.trim();
        !t.starts_with('#') && t.to_lowercase().contains("options") && t.to_lowercase().contains("indexes")
    });
    if has_options_indexes {
        findings.push(SecurityFinding {
            service: "apache".into(),
            severity: "warning".into(),
            title: "Directory listing enabled (Options Indexes)".into(),
            description: "Apache will show a file listing for directories without an index file.".into(),
            recommendation: "Replace 'Options Indexes' with 'Options -Indexes' in httpd.conf.".into(),
        });
    }

    // ServerTokens
    let server_tokens_full = content.lines().any(|l| {
        let t = l.trim().to_lowercase();
        !t.starts_with('#') && t.starts_with("servertokens") && (t.contains("full") || t.contains("os") || t.contains("major") || t.contains("minor"))
    });
    let server_tokens_set = content.lines().any(|l| {
        let t = l.trim().to_lowercase();
        !t.starts_with('#') && t.starts_with("servertokens")
    });
    if server_tokens_full || !server_tokens_set {
        findings.push(SecurityFinding {
            service: "apache".into(),
            severity: "info".into(),
            title: "ServerTokens not minimal".into(),
            description: "Apache may expose its version and OS in HTTP response headers.".into(),
            recommendation: "Add 'ServerTokens Prod' and 'ServerSignature Off' to httpd.conf.".into(),
        });
    }

    // ServerSignature
    let sig_on = content.lines().any(|l| {
        let t = l.trim().to_lowercase();
        !t.starts_with('#') && t.starts_with("serversignature") && t.contains("on")
    });
    if sig_on {
        findings.push(SecurityFinding {
            service: "apache".into(),
            severity: "info".into(),
            title: "ServerSignature is On".into(),
            description: "Apache appends server version info to error pages.".into(),
            recommendation: "Set ServerSignature Off in httpd.conf.".into(),
        });
    }
}

// ── MySQL checks ──────────────────────────────────────────────────────────────

fn run_mysql_scalar(query: &str) -> Option<String> {
    let base_path = get_installation_path();
    let mysql_path = get_mysql_client_exe(&base_path);
    if !mysql_path.exists() {
        return None;
    }
    let output = create_hidden_command(&mysql_path.to_string_lossy())
        .args(["-u", "root", "--batch", "--skip-column-names", "-e", query])
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

fn check_mysql(findings: &mut Vec<SecurityFinding>) {
    // Check if MySQL is reachable at all.
    if run_mysql_scalar("SELECT 1").is_none() {
        findings.push(SecurityFinding {
            service: "mysql".into(),
            severity: "info".into(),
            title: "MySQL not reachable".into(),
            description: "MySQL is not running or root has a password set. Some checks were skipped.".into(),
            recommendation: "Start MySQL and run the analyzer again.".into(),
        });
        return;
    }

    // Root with empty password
    let empty_root = run_mysql_scalar(
        "SELECT COUNT(*) FROM mysql.user WHERE User='root' AND (authentication_string='' OR authentication_string IS NULL);"
    );
    if empty_root.as_deref() == Some("1") {
        findings.push(SecurityFinding {
            service: "mysql".into(),
            severity: "warning".into(),
            title: "Root has no password".into(),
            description: "The MySQL root account has no password set.".into(),
            recommendation: "Set a password via MySQL Users manager or: ALTER USER 'root'@'localhost' IDENTIFIED BY 'strong_password';".into(),
        });
    }

    // Anonymous users
    let anon = run_mysql_scalar(
        "SELECT COUNT(*) FROM mysql.user WHERE User='';"
    );
    if anon.as_deref().map(|v| v != "0").unwrap_or(false) {
        findings.push(SecurityFinding {
            service: "mysql".into(),
            severity: "error".into(),
            title: "Anonymous MySQL users exist".into(),
            description: "There are user accounts with an empty username in mysql.user.".into(),
            recommendation: "Run: DELETE FROM mysql.user WHERE User=''; FLUSH PRIVILEGES;".into(),
        });
    }

    // Remote root access
    let remote_root = run_mysql_scalar(
        "SELECT COUNT(*) FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');"
    );
    if remote_root.as_deref().map(|v| v != "0").unwrap_or(false) {
        findings.push(SecurityFinding {
            service: "mysql".into(),
            severity: "error".into(),
            title: "Root can connect from remote hosts".into(),
            description: "The root user is allowed to connect from non-localhost hosts.".into(),
            recommendation: "Delete remote root entries: DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1'); FLUSH PRIVILEGES;".into(),
        });
    }

    // Test database
    let test_db = run_mysql_scalar(
        "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='test';"
    );
    if test_db.as_deref() == Some("1") {
        findings.push(SecurityFinding {
            service: "mysql".into(),
            severity: "info".into(),
            title: "Test database exists".into(),
            description: "The default 'test' database is present and accessible to any user.".into(),
            recommendation: "Drop it if unused: DROP DATABASE test;".into(),
        });
    }
}

// ── main command ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn analyze_security() -> Result<Vec<SecurityFinding>, String> {
    let mut findings: Vec<SecurityFinding> = Vec::new();

    check_php(&mut findings);
    check_apache(&mut findings);
    check_mysql(&mut findings);

    // Sort: errors first, then warnings, then info.
    findings.sort_by_key(|f| match f.severity.as_str() {
        "error" => 0,
        "warning" => 1,
        _ => 2,
    });

    Ok(findings)
}
