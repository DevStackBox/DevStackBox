// Virtual host management commands.
//
// Virtual host definitions are stored as JSON:
//   user_config_dir()/vhosts.json   (persistent source of truth)
//
// The Apache-included file is regenerated from that list on every change:
//   user_config_dir()/vhosts.conf   (included via IncludeOptional in httpd.conf)
//
// Windows hosts file entries (127.0.0.1 domain) are written/removed via an
// elevated PowerShell script launched by update_hosts_entry.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::utils::paths::{to_apache_path, user_config_dir, user_logs_dir};
use crate::utils::process::create_hidden_command;

// ── types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VhostEntry {
    pub domain: String,
    pub doc_root: String,
    pub enabled: bool,
}

// ── paths ─────────────────────────────────────────────────────────────────────

fn vhosts_json_path() -> PathBuf {
    user_config_dir().join("vhosts.json")
}

fn vhosts_conf_path() -> PathBuf {
    user_config_dir().join("vhosts.conf")
}

fn windows_hosts_path() -> PathBuf {
    PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts")
}

const HOSTS_MARKER_BEGIN: &str = "# DevStackBox BEGIN";
const HOSTS_MARKER_END: &str = "# DevStackBox END";

// ── helpers ───────────────────────────────────────────────────────────────────

fn load_vhosts() -> Vec<VhostEntry> {
    let path = vhosts_json_path();
    if !path.exists() {
        return Vec::new();
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str::<Vec<VhostEntry>>(&content).unwrap_or_default()
}

fn save_vhosts(entries: &[VhostEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(vhosts_json_path(), json).map_err(|e| e.to_string())?;
    write_vhosts_conf(entries)
}

fn generate_vhost_block(entry: &VhostEntry) -> String {
    let doc_root = to_apache_path(std::path::Path::new(&entry.doc_root));
    let logs = to_apache_path(&user_logs_dir());
    let domain = &entry.domain;
    format!(
        "# Virtual Host: {domain}\n\
         <VirtualHost *:80>\n\
         \x20\x20\x20\x20ServerName {domain}\n\
         \x20\x20\x20\x20DocumentRoot \"{doc_root}\"\n\
         \n\
         \x20\x20\x20\x20<Directory \"{doc_root}\">\n\
         \x20\x20\x20\x20\x20\x20\x20\x20Options -Indexes +FollowSymLinks\n\
         \x20\x20\x20\x20\x20\x20\x20\x20AllowOverride All\n\
         \x20\x20\x20\x20\x20\x20\x20\x20Require all granted\n\
         \x20\x20\x20\x20\x20\x20\x20\x20DirectoryIndex index.php index.html index.htm\n\
         \x20\x20\x20\x20</Directory>\n\
         \n\
         \x20\x20\x20\x20AddHandler php-script .php\n\
         \x20\x20\x20\x20Action php-script /php/php-cgi.exe\n\
         \x20\x20\x20\x20AddType application/x-httpd-php .php\n\
         \n\
         \x20\x20\x20\x20ErrorLog \"{logs}/vhost-{domain}-error.log\"\n\
         \x20\x20\x20\x20CustomLog \"{logs}/vhost-{domain}-access.log\" common\n\
         </VirtualHost>\n"
    )
}

fn write_vhosts_conf(entries: &[VhostEntry]) -> Result<(), String> {
    let mut conf = String::from(
        "# DevStackBox Virtual Hosts\n\
         # Auto-generated from vhosts.json. Do not edit manually.\n\n",
    );
    for entry in entries.iter().filter(|e| e.enabled) {
        conf.push_str(&generate_vhost_block(entry));
        conf.push('\n');
    }
    std::fs::write(vhosts_conf_path(), conf).map_err(|e| e.to_string())
}

/// Validate that a domain string is safe (no path traversal, no whitespace).
fn validate_domain(domain: &str) -> Result<(), String> {
    if domain.is_empty() {
        return Err("Domain name cannot be empty".to_string());
    }
    if domain.contains("..") || domain.contains('/') || domain.contains('\\') || domain.contains(' ') {
        return Err("Invalid domain name: must not contain spaces, slashes, or '..'".to_string());
    }
    // Allow alphanumeric, dots, and hyphens only.
    if !domain.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-') {
        return Err("Invalid domain name: only letters, digits, hyphens, and dots are allowed".to_string());
    }
    Ok(())
}

/// Write a temp PowerShell script and run it via an elevated (UAC) process.
/// Blocks until the user responds to the UAC prompt and the script finishes.
fn run_elevated_hosts_script(script: &str) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("devstackbox_hosts_update.ps1");
    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write temp script: {e}"))?;

    // Escape single quotes in path for PowerShell single-quoted strings.
    let safe_path = script_path.to_string_lossy().replace('\'', "''");

    // The outer (non-elevated) PowerShell spawns an elevated inner PowerShell
    // via Start-Process -Verb RunAs -Wait, then exits after the inner one is done.
    let elevate_cmd = format!(
        "Start-Process powershell -Verb RunAs -Wait \
         -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{safe_path}'"
    );

    let output = create_hidden_command("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &elevate_cmd])
        .output()
        .map_err(|e| format!("Failed to launch elevated process: {e}"))?;

    let _ = std::fs::remove_file(&script_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Elevated process failed (user may have cancelled UAC): {}{}",
            stderr, stdout
        ));
    }

    Ok(())
}

// ── commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_vhosts() -> Result<Vec<VhostEntry>, String> {
    Ok(load_vhosts())
}

#[tauri::command]
pub async fn add_vhost(domain: String, doc_root: String) -> Result<(), String> {
    validate_domain(&domain)?;

    if doc_root.is_empty() {
        return Err("Document root cannot be empty".to_string());
    }

    let mut entries = load_vhosts();

    if entries.iter().any(|e| e.domain == domain) {
        return Err(format!("Virtual host '{}' already exists", domain));
    }

    // Create the doc_root directory if it does not yet exist.
    let doc_path = std::path::Path::new(&doc_root);
    if !doc_path.exists() {
        std::fs::create_dir_all(doc_path)
            .map_err(|e| format!("Failed to create document root directory: {e}"))?;
    }

    entries.push(VhostEntry {
        domain,
        doc_root,
        enabled: true,
    });

    save_vhosts(&entries)
}

#[tauri::command]
pub async fn remove_vhost(domain: String) -> Result<(), String> {
    let mut entries = load_vhosts();
    let before = entries.len();
    entries.retain(|e| e.domain != domain);
    if entries.len() == before {
        return Err(format!("Virtual host '{}' not found", domain));
    }
    save_vhosts(&entries)
}

#[tauri::command]
pub async fn toggle_vhost(domain: String, enabled: bool) -> Result<(), String> {
    let mut entries = load_vhosts();
    let entry = entries
        .iter_mut()
        .find(|e| e.domain == domain)
        .ok_or_else(|| format!("Virtual host '{}' not found", domain))?;
    entry.enabled = enabled;
    save_vhosts(&entries)
}

/// Returns the list of entries managed by DevStackBox in the Windows hosts file.
/// Each returned string is a full hosts line such as "127.0.0.1 myapp.test".
#[tauri::command]
pub async fn get_hosts_entries() -> Result<Vec<String>, String> {
    let hosts_path = windows_hosts_path();
    if !hosts_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&hosts_path).map_err(|e| e.to_string())?;
    let mut inside = false;
    let mut entries = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == HOSTS_MARKER_BEGIN {
            inside = true;
            continue;
        }
        if trimmed == HOSTS_MARKER_END {
            inside = false;
            continue;
        }
        if inside && !trimmed.is_empty() && !trimmed.starts_with('#') {
            entries.push(trimmed.to_string());
        }
    }

    Ok(entries)
}

/// Add or remove a "127.0.0.1 <domain>" entry in the Windows hosts file.
/// Requires administrator rights – triggers a UAC elevation prompt.
/// `action` must be "add" or "remove".
#[tauri::command]
pub async fn update_hosts_entry(domain: String, action: String) -> Result<String, String> {
    validate_domain(&domain)?;

    if action != "add" && action != "remove" {
        return Err("Action must be 'add' or 'remove'".to_string());
    }

    let entry_line = format!("127.0.0.1 {}", domain);

    let script = match action.as_str() {
        "add" => format!(
            // PowerShell: ensure markers exist, then insert the entry inside them
            // (deduplicate if it is already there).
            "$hostsPath = \"C:\\Windows\\System32\\drivers\\etc\\hosts\"\r\n\
             $markerBegin = \"{begin}\"\r\n\
             $markerEnd = \"{end}\"\r\n\
             $entry = \"{entry}\"\r\n\
             $content = [System.IO.File]::ReadAllText($hostsPath)\r\n\
             if (-not $content.Contains($markerBegin)) {{\r\n\
             \x20\x20\x20\x20$append = [System.Environment]::NewLine + $markerBegin + [System.Environment]::NewLine + $markerEnd\r\n\
             \x20\x20\x20\x20[System.IO.File]::AppendAllText($hostsPath, $append)\r\n\
             }}\r\n\
             $lines = [System.IO.File]::ReadAllLines($hostsPath)\r\n\
             $newLines = [System.Collections.Generic.List[string]]::new()\r\n\
             $inside = $false\r\n\
             $added = $false\r\n\
             foreach ($line in $lines) {{\r\n\
             \x20\x20\x20\x20if ($line.Trim() -eq $markerBegin) {{\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20$inside = $true\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20$newLines.Add($line)\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20continue\r\n\
             \x20\x20\x20\x20}}\r\n\
             \x20\x20\x20\x20if ($line.Trim() -eq $markerEnd) {{\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20if ($inside -and -not $added) {{\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20$newLines.Add($entry)\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20$added = $true\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20}}\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20$inside = $false\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20$newLines.Add($line)\r\n\
             \x20\x20\x20\x20\x20\x20\x20\x20continue\r\n\
             \x20\x20\x20\x20}}\r\n\
             \x20\x20\x20\x20if ($inside -and $line.Trim() -eq $entry) {{ $added = $true }}\r\n\
             \x20\x20\x20\x20$newLines.Add($line)\r\n\
             }}\r\n\
             [System.IO.File]::WriteAllLines($hostsPath, $newLines)\r\n",
            begin = HOSTS_MARKER_BEGIN,
            end = HOSTS_MARKER_END,
            entry = entry_line,
        ),
        "remove" => format!(
            "$hostsPath = \"C:\\Windows\\System32\\drivers\\etc\\hosts\"\r\n\
             $entry = \"{entry}\"\r\n\
             $lines = [System.IO.File]::ReadAllLines($hostsPath)\r\n\
             $newLines = @($lines | Where-Object {{ $_.Trim() -ne $entry }})\r\n\
             [System.IO.File]::WriteAllLines($hostsPath, $newLines)\r\n",
            entry = entry_line,
        ),
        _ => unreachable!(),
    };

    run_elevated_hosts_script(&script)?;

    Ok(format!(
        "{} hosts file entry for {}",
        if action == "add" { "Added" } else { "Removed" },
        domain
    ))
}
