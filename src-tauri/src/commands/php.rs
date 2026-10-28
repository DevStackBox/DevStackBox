// PHP commands.

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::types::{PHPVersionInfo, ServiceInfo};
use crate::utils::paths::{get_installation_path, to_apache_path, user_config_dir, user_sessions_dir};
use crate::utils::process::create_hidden_command;

// Branches we surface in the UI. The bundled default is 8.3; the others are
// downloadable on demand (Roadmap Phase 3.1).
const PHP_BRANCHES: &[&str] = &["8.2", "8.3", "8.4", "8.5"];

// The version that ships bundled with the installer.  When the installer
// flattens PHP straight into php/ (php/php.exe instead of php/8.3/php.exe),
// that flat copy is treated as this version.
const BUNDLED_PHP_VERSION: &str = "8.3";
pub(crate) static PHP_RUNTIME_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

// Minimum upstream fixes for CVE-2026-109618 and CVE-2026-109619.
fn security_minimum(branch: &str) -> Option<&'static str> {
    match branch {
        "8.2" => Some("8.2.35"), "8.3" => Some("8.3.36"),
        "8.4" => Some("8.4.27"), "8.5" => Some("8.5.12"), _ => None,
    }
}

// The Windows feed adds a numeric packaging revision, e.g. 8.4.27-1.
// PHP_VERSION may still report 8.4.27 for that archive.
fn release_tuple(version: &str) -> Option<(u32, u32, u32, u32)> {
    let (base, revision) = match version.split_once('-') {
        Some((base, revision)) => (base, revision),
        None => (version, "0"),
    };
    let number = |value: &str| -> Option<u32> {
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) { return None; }
        value.parse().ok()
    };
    let parts: Vec<_> = base.split('.').collect();
    if parts.len() != 3 { return None; }
    Some((number(parts[0])?, number(parts[1])?, number(parts[2])?, number(revision)?))
}

fn version_tuple(version: &str) -> Option<(u32, u32, u32)> {
    release_tuple(version).map(|(major, minor, patch, _)| (major, minor, patch))
}

fn runtime_matches_release(runtime: &str, release: &str) -> bool {
    match (release_tuple(runtime), release_tuple(release)) {
        (Some(actual), Some(expected)) => actual.0 == expected.0 && actual.1 == expected.1
            && actual.2 == expected.2 && (actual.3 == 0 || actual.3 == expected.3),
        _ => false,
    }
}

// Remember the verified archive revision; do not infer it from PHP_VERSION.
// Bind the receipt to php.exe so a replaced runtime cannot inherit a stale label.
fn installed_release(directory: &Path, runtime: &str) -> String {
    let receipt = fs::read(directory.join(".devstackbox-release.json")).ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    if let Some(receipt) = receipt {
        if let (Some(release), Some(hash)) = (receipt["release"].as_str(), receipt["exeSha256"].as_str()) {
            if runtime_matches_release(runtime, release)
                && fs::read(directory.join("php.exe")).ok().is_some_and(|bytes| format!("{:x}", Sha256::digest(bytes)) == hash) {
                return release.to_string();
            }
        }
    }
    runtime.to_string()
}

fn meets_security_minimum(branch: &str, version: &str) -> bool {
    match (security_minimum(branch).and_then(version_tuple), version_tuple(version)) {
        (Some(min), Some(actual)) => actual.0 == min.0 && actual.1 == min.1 && actual >= min,
        _ => false,
    }
}

fn read_runtime_version(exe: &Path) -> Option<String> {
    let output = create_hidden_command(&exe.to_string_lossy())
        .args(["-n", "-r", "echo PHP_VERSION;"]).output().ok()?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && version_tuple(&version).is_some()).then_some(version)
}

fn php_root() -> PathBuf {
    get_installation_path().join("php")
}

// True when PHP is installed in the "flat" layout produced by the NSIS
// resource bundler: php/php.exe sits directly in php/ with no version
// subdirectory.  The bundler follows the php/current junction and copies
// the active branch's contents to the top level, collapsing the structure.
fn is_flat_layout() -> bool {
    php_root().join("php.exe").exists()
}

// Resolves the directory that actually holds php.exe for `version`.
// Order:
//   1. versioned dir  php/<version>/       (standard multi-version layout)
//   2. flat dir       php/                 (only for the bundled default)
fn php_branch_dir(version: &str) -> PathBuf {
    let versioned = php_root().join(version);
    if versioned.join("php.exe").exists() {
        return versioned;
    }
    if version == BUNDLED_PHP_VERSION && is_flat_layout() {
        return php_root();
    }
    versioned
}

fn php_branch_exe(version: &str) -> PathBuf {
    php_branch_dir(version).join("php.exe")
}

pub(crate) fn project_runtime(version: &str) -> Result<(PathBuf, PathBuf), String> {
    if !PHP_BRANCHES.contains(&version) {
        return Err("Choose a supported installed PHP version.".into());
    }
    let directory = php_branch_dir(version);
    if !directory.join("php.exe").is_file() || !directory.join("php-cgi.exe").is_file() {
        return Err(format!("PHP {version} is not installed completely. Install it from PHP Versions first."));
    }
    if !read_runtime_version(&directory.join("php.exe")).is_some_and(|v| meets_security_minimum(version, &v)) {
        return Err(format!("PHP {version} needs a supported security update. Update it in PHP Versions before assigning it to a project."));
    }
    Ok((directory, user_config_dir().join("php-runtimes").join(version).join("php.ini")))
}

pub(crate) fn prepare_project_runtime(version: &str) -> Result<(), String> {
    let (directory, ini) = project_runtime(version)?;
    let output = create_hidden_command(&directory.join("php.exe").to_string_lossy())
        .args(["-n", "-r", "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;"])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != version {
        return Err(format!("The installed PHP {version} runtime failed validation. Reinstall it from PHP Versions."));
    }
    if ini.is_file() {
        let content = fs::read_to_string(&ini).map_err(|e| e.to_string())?;
        let updated = temporary_defaults(&content, &to_apache_path(&crate::utils::paths::user_tmp_dir()));
        if content != updated { fs::write(&ini, updated).map_err(|e| e.to_string())?; }
        return Ok(());
    }
    let template = [directory.join("php.ini"), directory.join("php.ini-production")]
        .into_iter().find(|p| p.is_file()).ok_or("Installed PHP configuration template is missing")?;
    let content = fs::read_to_string(template).map_err(|e| e.to_string())?;
    let settings = content.lines().filter(|line| {
        let key = line.split('=').next().unwrap_or("").trim();
        !["extension_dir", "session.save_path", "error_log"].iter().any(|name| key.eq_ignore_ascii_case(name))
    }).collect::<Vec<_>>().join("\n");
    let sessions = user_sessions_dir();
    fs::create_dir_all(&sessions).map_err(|e| e.to_string())?;
    let header = format!("; DevStackBox pinned PHP {version}\nextension_dir=\"{}\"\nsession.save_path=\"{}\"\nerror_log=\"{}\"\n",
        to_apache_path(&directory.join("ext")), to_apache_path(&sessions),
        to_apache_path(&crate::utils::paths::user_logs_dir().join(format!("php-{version}-error.log"))));
    fs::create_dir_all(ini.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(ini, temporary_defaults(&format!("{header}{}", enable_essential_extensions(settings, &directory.join("ext"))), &to_apache_path(&crate::utils::paths::user_tmp_dir())))
        .map_err(|e| e.to_string())
}

pub(crate) fn validate_web_runtimes() -> Result<(), String> {
    let current = php_root().join("current").join("php.exe");
    let exe = if current.exists() { current } else { php_branch_exe(BUNDLED_PHP_VERSION) };
    let version = read_runtime_version(&exe).ok_or("Cannot read the active PHP version. Repair or update PHP in PHP Versions.")?;
    let (major, minor, _) = version_tuple(&version).ok_or("Invalid active PHP version")?;
    if !meets_security_minimum(&format!("{major}.{minor}"), &version) {
        return Err(format!("PHP {version} requires a security update before Apache can start. Open Services > PHP > Versions and update or activate a patched supported branch."));
    }
    for site in super::vhosts::load_vhosts()?.into_iter().filter(|site| site.enabled) {
        if let Some(branch) = site.php_version.as_deref() {
            project_runtime(branch).map_err(|e| format!("Project {}: {e}", site.domain))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_php_status() -> Result<ServiceInfo, String> {
    let version = get_current_php_version().await;

    Ok(ServiceInfo {
        running: version.is_some(),
        pid: None,
        port: None,
        version,
    })
}

async fn get_current_php_version() -> Option<String> {
    let current_exe = php_root().join("current").join("php.exe");
    let exe = if current_exe.exists() {
        current_exe
    } else {
        // Falls back to the bundled default, resolving either the versioned
        // (php/8.3/php.exe) or flat (php/php.exe) layout.
        let default_exe = php_branch_exe(BUNDLED_PHP_VERSION);
        if !default_exe.exists() {
            return None;
        }
        default_exe
    };

    read_runtime_version(&exe)
}

async fn check_active_php_version(version: &str) -> bool {
    let current_path = php_root().join("current");
    if current_path.exists() {
        if let Ok(target) = fs::read_link(&current_path) {
            if let Some(target_str) = target.to_str() {
                return target_str.contains(version);
            }
        }
    }
    // No junction exists yet (fresh install). The bundled default is
    // considered active as long as its exe is present (versioned or flat).
    if version == BUNDLED_PHP_VERSION {
        return php_branch_exe(BUNDLED_PHP_VERSION).exists();
    }
    false
}

async fn update_php_config(_version: &str) -> Result<(), String> {
    patch_php_ini();
    // The httpd.conf ScriptAlias points to php/current/ (a junction).
    // Switching PHP versions only requires updating the junction target,
    // which switch_php_version already does via mklink /J.
    // Apache picks up the change on next restart - no conf rewrite needed.
    Ok(())
}

use crate::utils::php_defaults::{enable_extensions as enable_essential_extensions, temporary_defaults};

// Ensures the active PHP's php.ini has the minimum settings required for
// DevStackBox to work (session path, extension_dir, essential extensions).
// Called by start_apache on every start.
//
// IMPORTANT: this function writes to the USER CONFIG directory
// (%LOCALAPPDATA%\devstackbox\config\php.ini), never to the installation
// directory.  This keeps the bundled php/*/php.ini pristine and unmodified
// so it can be committed to git and distributed through the installer
// without containing any machine-specific paths.
pub fn patch_php_ini() {
    // Locate the bundled (template) php.ini from the installation directory.
    // Tries the active junction, then the versioned default dir, then the
    // flat layout, and finally php.ini-production as a last resort.
    let template_ini = {
        let candidates = [
            php_root().join("current").join("php.ini"),
            php_root().join(BUNDLED_PHP_VERSION).join("php.ini"),
            php_root().join("php.ini"),
            php_branch_dir(BUNDLED_PHP_VERSION).join("php.ini"),
            php_branch_dir(BUNDLED_PHP_VERSION).join("php.ini-production"),
        ];
        match candidates.into_iter().find(|p| p.exists()) {
            Some(p) => p,
            None => {
                println!("patch_php_ini: no template php.ini found under {}", php_root().display());
                return;
            }
        }
    };

    if !template_ini.exists() {
        return;
    }

    // The user-specific php.ini lives in the user config dir so it is
    // never committed to the repository or bundled in the installer.
    let php_ini = user_config_dir().join("php.ini");

    // Seed from the bundled template on first run.
    let first_run = !php_ini.exists();
    if first_run {
        if let Err(e) = std::fs::copy(&template_ini, &php_ini) {
            println!("Failed to copy php.ini template: {}", e);
            return;
        }
    }

    let content = match std::fs::read_to_string(&php_ini) {
        Ok(c) => c,
        Err(_) => return,
    };

    // Extension dir: absolute path pointing to the installation's ext/ folder.
    // Absolute is required here because this php.ini lives in a different
    // directory from the PHP binaries.  The path is runtime-computed from the
    // actual install location, so it is correct on every user's machine.
    let ext_dir = crate::utils::paths::active_php_dir().join("ext");
    let ext_dir_str = to_apache_path(&ext_dir);

    // Sessions go under the user data root so PHP CGI can always write there.
    let sessions_str = to_apache_path(&user_sessions_dir());
    let error_log = to_apache_path(&crate::utils::paths::user_logs_dir().join("php_error.log"));

    let mut new_content = String::with_capacity(content.len() + 256);
    let mut session_save_path_set = false;
    let mut extension_dir_set = false;
    let mut display_errors_set = false;
    let mut log_errors_set = false;
    let mut error_log_set = false;

    for line in content.lines() {
        let trimmed = line.trim();

        // Replace commented-out or wrong session.save_path.
        if trimmed.starts_with(';') && trimmed.contains("session.save_path") {
            // Skip the comment line - we'll append the real value below.
            new_content.push_str(line);
            new_content.push('\n');
            if !session_save_path_set {
                new_content.push_str(&format!(
                    "session.save_path = \"{}\"\n",
                    sessions_str
                ));
                session_save_path_set = true;
            }
            continue;
        }
        if trimmed.starts_with("session.save_path") {
            // Overwrite any existing value with the correct path.
            new_content.push_str(&format!(
                "session.save_path = \"{}\"\n",
                sessions_str
            ));
            session_save_path_set = true;
            continue;
        }

        if trimmed.starts_with("display_errors") && !trimmed.starts_with(';') {
            new_content.push_str("display_errors = Off\n");
            display_errors_set = true;
            continue;
        }
        if trimmed.starts_with("log_errors") && !trimmed.starts_with(';') {
            new_content.push_str("log_errors = On\n");
            log_errors_set = true;
            continue;
        }
        if trimmed.starts_with("error_log") && !trimmed.starts_with(';') {
            new_content.push_str(&format!("error_log = \"{}\"\n", error_log));
            error_log_set = true;
            continue;
        }

        // Replace commented-out or wrong extension_dir with an absolute path
        // to the installation's ext/ folder.  Absolute is correct here because
        // this php.ini is in user_config_dir, not next to the PHP binaries.
        if trimmed.starts_with(';') && trimmed.contains("extension_dir") && trimmed.contains("ext") {
            new_content.push_str(line);
            new_content.push('\n');
            if !extension_dir_set {
                new_content.push_str(&format!("extension_dir = \"{}\"\n", ext_dir_str));
                extension_dir_set = true;
            }
            continue;
        }
        if trimmed.starts_with("extension_dir") {
            new_content.push_str(&format!("extension_dir = \"{}\"\n", ext_dir_str));
            extension_dir_set = true;
            continue;
        }

        // PHP 8.4 deprecation: these directives emit a startup deprecation
        // notice, which (because html_errors defaults to On) produces a
        // "<br />" before the CGI headers - corrupting every CGI response
        // with "Bad header: <br />" and a 500 to the client.  Comment them
        // out so PHP uses the modern defaults.
        if (trimmed.starts_with("session.sid_length")
            || trimmed.starts_with("session.sid_bits_per_character"))
            && !trimmed.starts_with(';')
        {
            new_content.push_str("; ");
            new_content.push_str(line);
            new_content.push_str("  ; commented out by DevStackBox (deprecated in PHP 8.4)\n");
            continue;
        }

        // Exclude E_DEPRECATED / E_STRICT from error_reporting. phpMyAdmin
        // 5.x triggers thousands of deprecation notices on PHP 8.4 (vendor
        // thecodingmachine/safe), which under CGI both corrupt headers and
        // blow past max_execution_time during autoload.  Same default that
        // XAMPP and WAMP use for production php.ini.
        if trimmed.starts_with("error_reporting") && !trimmed.starts_with(';') {
            new_content.push_str("error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT\n");
            continue;
        }

        // html_errors = On wraps every error in HTML <br />, which corrupts
        // CGI responses (Apache reports "Bad header: <br />" and returns 500).
        // Plain-text errors still go to the log; the response stays clean.
        if trimmed.starts_with("html_errors") && !trimmed.starts_with(';') {
            new_content.push_str("html_errors = Off\n");
            continue;
        }

        new_content.push_str(line);
        new_content.push('\n');
    }

    // Append if the directives were never encountered.
    if !session_save_path_set {
        new_content.push_str(&format!(
            "\n; Added by DevStackBox\nsession.save_path = \"{}\"\n",
            sessions_str
        ));
    }
    if !extension_dir_set {
        new_content.push_str(&format!(
            "\n; Added by DevStackBox\nextension_dir = \"{}\"\n",
            ext_dir_str
        ));
    }
    if !display_errors_set { new_content.push_str("\ndisplay_errors = Off\n"); }
    if !log_errors_set { new_content.push_str("log_errors = On\n"); }
    if !error_log_set { new_content.push_str(&format!("error_log = \"{}\"\n", error_log)); }

    // Enable essential extensions if not already active.
    if first_run { new_content = enable_essential_extensions(new_content, &ext_dir); }

    let new_content = temporary_defaults(&new_content, &to_apache_path(&crate::utils::paths::user_tmp_dir()));
    if content != new_content { let _ = std::fs::write(&php_ini, new_content); }
    if let Ok(content) = std::fs::read_to_string(&php_ini) {
        let tmp = crate::utils::paths::to_apache_path(&crate::utils::paths::user_tmp_dir());
        if let Some(migrated) =
            crate::utils::php_ini_import::maybe_migrate_php_import_limits(&content, &tmp)
        {
            let _ = std::fs::write(&php_ini, migrated);
        }
    }
    println!("php.ini patched at user config dir: session.save_path={} extension_dir={}", sessions_str, ext_dir_str);
}


#[tauri::command]
pub async fn get_php_versions() -> Result<Vec<PHPVersionInfo>, String> {
    let mut versions = Vec::new();
    // One bounded request for all branches. Offline still shows measured installations.
    let releases = fetch_php_releases().await;

    for version in PHP_BRANCHES {
        let exe = php_branch_exe(version);
        let installed = exe.exists();
        let installed_version = if installed { read_runtime_version(&exe).map(|runtime| installed_release(&php_branch_dir(version), &runtime)) } else { None };
        let release = releases.as_ref().ok().and_then(|json| pick_zip_url(version, json));
        let latest_version = release.as_ref().map(|r| r.0.clone());
        let update_available = installed && latest_version.as_deref().is_some_and(|latest| {
            match installed_version.as_deref().and_then(release_tuple) {
                Some(current) => release_tuple(latest).is_some_and(|next| next > current),
                None => true,
            }
        });

        let active = if installed {
            check_active_php_version(version).await
        } else {
            false
        };

        versions.push(PHPVersionInfo {
            version: (*version).to_string(),
            security_update_required: installed && !installed_version.as_deref().is_some_and(|v| meets_security_minimum(version, v)),
            installed_version,
            latest_version,
            update_available,
            end_of_life: security_minimum(version).is_none(),
            release_error: if security_minimum(version).is_none() { None } else {
                releases.as_ref().err().cloned().or_else(|| release.is_none().then(|| "No patched Windows build is currently listed. Refresh to retry.".to_string()))
            },
            status: if installed { "installed".to_string() } else { "available".to_string() },
            path: exe.display().to_string(),
            is_active: active,
            installed,
            download_url: format!(
                "https://windows.php.net/downloads/releases/archives/?branch={}",
                version
            ),
        });
    }

    Ok(versions)
}

#[tauri::command]
pub async fn switch_php_version(version: String) -> Result<bool, String> {
    let _guard = super::ssl::SITE_LOCK.lock().await;
    let _process_lock = super::ssl::lock_configuration()?;
    let _runtime_guard = PHP_RUNTIME_LOCK.try_lock().map_err(|_| "A PHP runtime operation is in progress.")?;
    if !PHP_BRANCHES.contains(&version.as_str()) { return Err("Unsupported PHP version".into()); }
    let exe = php_branch_exe(&version);
    if !exe.exists() {
        return Err(format!("PHP {} is not installed", version));
    }
    if !read_runtime_version(&exe).is_some_and(|v| meets_security_minimum(&version, &v)) {
        return Err("Update this PHP runtime to a supported security release before activating it.".into());
    }

    let current_link = php_root().join("current");
    let branch_dir = php_branch_dir(&version);

    let previous = php_root().join("current-previous");
    if previous.exists() { return Err("A previous PHP switch needs recovery. Restore php/current-previous before switching.".into()); }
    let had_current = current_link.exists();
    if had_current { fs::rename(&current_link, &previous).map_err(|e| e.to_string())?; }
    let result = create_hidden_command("cmd")
        .args(["/D", "/C", "mklink", "/J"])
        .arg(&current_link).arg(&branch_dir).output();
    match result {
        Ok(output) if output.status.success() => {
            update_php_config(&version).await?;
            if had_current { fs::remove_dir(&previous).map_err(|e| e.to_string())?; }
            Ok(true)
        }
        result => {
            if had_current { fs::rename(&previous, &current_link).map_err(|e| format!("PHP switch recovery failed: {e}"))?; }
            Err(match result {
                Ok(output) => format!("Could not switch PHP: {}", String::from_utf8_lossy(&output.stderr)),
                Err(error) => format!("Could not switch PHP: {error}"),
            })
        }
    }
}

// ----------------------------------------------------------------------
// Real PHP version downloader (Roadmap Phase 3.1).
// Resolves the latest release for the requested major.minor branch via
// `https://windows.php.net/downloads/releases/releases.json`, downloads
// the x64 Thread-Safe VS16 zip, extracts it into `<install>/php/<version>/`,
// and writes a default `php.ini`.
// Progress is emitted to the frontend via the `php-download-progress` event.
// ----------------------------------------------------------------------

#[derive(Serialize, Clone)]
struct PhpDownloadProgress {
    version: String,
    stage: String, // "resolving" | "downloading" | "extracting" | "configuring" | "complete" | "error"
    percent: u32,  // 0-100
    downloaded: u64,
    total: u64,
    message: Option<String>,
}

fn emit_progress(app: &AppHandle, payload: PhpDownloadProgress) {
    let _ = app.emit("php-download-progress", payload);
}

fn pick_zip_url(branch: &str, releases_json: &serde_json::Value) -> Option<(String, String, String)> {
    // releases.json shape (excerpt):
    // { "8.3": { "version": "8.3.31",
    //            "ts-vs16-x64": { "zip": { "path": "php-8.3.31-Win32-vs16-x64.zip" } } } }
    //
    // We want the thread-safe x64 build, which lives under the
    // "ts-vs16-x64" key (or "ts-vs17-x64" for newer branches such as 8.4).
    let branch_obj = releases_json.get(branch)?;
    let full_version = branch_obj.get("version")?.as_str()?.to_string();
    if !meets_security_minimum(branch, &full_version) { return None; }
    let ts = branch_obj
        .get("ts-vs17-x64")
        .or_else(|| branch_obj.get("ts-vs16-x64"))?;
    let zip = ts.get("zip")?;
    let path = zip.get("path")?.as_str()?;
    if path.contains(['/', '\\']) || !path.ends_with(".zip") { return None; }
    let digest = zip.get("sha256")?.as_str()?.to_string();
    if digest.len() != 64 || !digest.chars().all(|c| c.is_ascii_hexdigit()) { return None; }
    let url = format!("https://windows.php.net/downloads/releases/{}", path);
    Some((full_version, url, digest))
}

async fn resolve_php_zip_url(branch: &str) -> Result<(String, String, String), String> {
    let json = fetch_php_releases().await?;
    pick_zip_url(branch, &json)
        .ok_or_else(|| format!("No patched Windows x64 TS build listed for PHP {}", branch))
}

async fn fetch_php_releases() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("DevStackBox")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .get("https://windows.php.net/downloads/releases/releases.json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases.json: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("releases.json returned HTTP {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases.json: {}", e))?;
    Ok(json)
}

async fn download_to_memory(app: &AppHandle, version: &str, url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("DevStackBox")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Download returned HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    if total > 256 * 1024 * 1024 { return Err("PHP download exceeds the size limit".into()); }
    let mut downloaded: u64 = 0;
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut stream = resp.bytes_stream();
    let mut last_percent: u32 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Download interrupted: {}", e))?;
        downloaded += bytes.len() as u64;
        if downloaded > 256 * 1024 * 1024 { return Err("PHP download exceeds the size limit".into()); }
        buf.extend_from_slice(&bytes);

        let percent = downloaded
            .saturating_mul(100)
            .checked_div(total)
            .unwrap_or(0) as u32;
        if percent != last_percent {
            last_percent = percent;
            emit_progress(
                app,
                PhpDownloadProgress {
                    version: version.to_string(),
                    stage: "downloading".to_string(),
                    percent,
                    downloaded,
                    total,
                    message: None,
                },
            );
        }
    }
    Ok(buf)
}

struct StagingDirectory(PathBuf);
impl Drop for StagingDirectory { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

fn extract_zip_to(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(target_dir)
        .map_err(|e| format!("Failed to create {}: {}", target_dir.display(), e))?;
    let reader = Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry {} unreadable: {}", i, e))?;
        let rel_path = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => return Err("Unsafe path in PHP archive".into()),
        };
        let out_path = target_dir.join(&rel_path);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if entry.size() > 512 * 1024 * 1024 { return Err("PHP archive entry exceeds size limit".into()); }
        let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn write_default_php_ini(branch_dir: &Path) -> Result<(), String> {
    let ini_path = branch_dir.join("php.ini");
    if ini_path.exists() {
        return Ok(());
    }
    // Prefer the production template shipped inside the PHP zip if present.
    let prod = branch_dir.join("php.ini-production");
    if prod.exists() {
        fs::copy(&prod, &ini_path).map_err(|e| e.to_string())?;
    } else {
        // Minimal fallback so php.exe runs even if templates are missing.
        let minimal =
            "; configVersion=1\nmemory_limit=256M\nupload_max_filesize=64M\npost_max_size=64M\n";
        fs::write(&ini_path, minimal).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn download_php_version(app: AppHandle, version: String) -> Result<bool, String> {
    let _guard = super::ssl::SITE_LOCK.try_lock().map_err(|_| "Another runtime or site operation is in progress. Try again when it finishes.")?;
    let _process_lock = super::ssl::lock_configuration()?;
    let _runtime_guard = PHP_RUNTIME_LOCK.try_lock().map_err(|_| "A PHP runtime operation is in progress.")?;
    if !PHP_BRANCHES.contains(&version.as_str()) { return Err("Unsupported PHP version".into()); }
    if security_minimum(&version).is_none() { return Err("PHP 8.1 is end-of-life. Choose PHP 8.2 or newer.".into()); }
    let target_dir = php_branch_dir(&version);
    if target_dir == php_root() {
        return Err("This legacy flat PHP installation must be upgraded with the latest DevStackBox installer first.".into());
    }

    emit_progress(
        &app,
        PhpDownloadProgress {
            version: version.clone(),
            stage: "resolving".to_string(),
            percent: 0,
            downloaded: 0,
            total: 0,
            message: Some("Looking up latest release...".to_string()),
        },
    );

    let (full_version, url, expected_digest) = match resolve_php_zip_url(&version).await {
        Ok(v) => v,
        Err(e) => {
            emit_progress(
                &app,
                PhpDownloadProgress {
                    version: version.clone(),
                    stage: "error".to_string(),
                    percent: 0,
                    downloaded: 0,
                    total: 0,
                    message: Some(e.clone()),
                },
            );
            return Err(e);
        }
    };

    if read_runtime_version(&target_dir.join("php.exe")).and_then(|v| release_tuple(&installed_release(&target_dir, &v)))
        .is_some_and(|current| release_tuple(&full_version).is_some_and(|latest| current >= latest)) {
        emit_progress(&app, PhpDownloadProgress { version, stage: "complete".into(), percent: 100,
            downloaded: 0, total: 0, message: Some("Already up to date".into()) });
        return Ok(true);
    }
    ensure_runtime_idle(&target_dir).await?;

    let zip_bytes = match download_to_memory(&app, &version, &url).await {
        Ok(b) => b,
        Err(e) => {
            emit_progress(
                &app,
                PhpDownloadProgress {
                    version: version.clone(),
                    stage: "error".to_string(),
                    percent: 0,
                    downloaded: 0,
                    total: 0,
                    message: Some(e.clone()),
                },
            );
            return Err(e);
        }
    };

    emit_progress(
        &app,
        PhpDownloadProgress {
            version: version.clone(),
            stage: "extracting".to_string(),
            percent: 100,
            downloaded: zip_bytes.len() as u64,
            total: zip_bytes.len() as u64,
            message: Some(format!("Extracting PHP {}...", full_version)),
        },
    );

    if format!("{:x}", Sha256::digest(&zip_bytes)) != expected_digest.to_lowercase() {
        return Err("PHP download checksum mismatch; installation cancelled".into());
    }
    let staging = StagingDirectory(php_root().join(format!(".download-{}-{}", version, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos())));
    let staging_dir = &staging.0;
    if let Err(e) = extract_zip_to(&zip_bytes, staging_dir) {
        emit_progress(
            &app,
            PhpDownloadProgress {
                version: version.clone(),
                stage: "error".to_string(),
                percent: 0,
                downloaded: 0,
                total: 0,
                message: Some(e.clone()),
            },
        );
        return Err(e);
    }

    emit_progress(
        &app,
        PhpDownloadProgress {
            version: version.clone(),
            stage: "configuring".to_string(),
            percent: 100,
            downloaded: zip_bytes.len() as u64,
            total: zip_bytes.len() as u64,
            message: Some("Writing default php.ini...".to_string()),
        },
    );
    // Preserve user settings; DLLs come from the verified release, never an older build.
    if target_dir.join("php.ini").is_file() {
        fs::copy(target_dir.join("php.ini"), staging_dir.join("php.ini")).map_err(|e| e.to_string())?;
    }
    if let Err(e) = write_default_php_ini(staging_dir) {
        emit_progress(
            &app,
            PhpDownloadProgress {
                version: version.clone(),
                stage: "error".to_string(),
                percent: 0,
                downloaded: 0,
                total: 0,
                message: Some(e.clone()),
            },
        );
        return Err(e);
    }

    let exe = staging_dir.join("php.exe");
    if !exe.exists() {
        let msg = format!("PHP {} extracted but php.exe is missing", version);
        emit_progress(
            &app,
            PhpDownloadProgress {
                version: version.clone(),
                stage: "error".to_string(),
                percent: 0,
                downloaded: 0,
                total: 0,
                message: Some(msg.clone()),
            },
        );
        return Err(msg);
    }

    if !read_runtime_version(&exe).is_some_and(|runtime| runtime_matches_release(&runtime, &full_version))
        || !staging_dir.join("php-cgi.exe").is_file() {
        return Err("Downloaded PHP failed its version/completeness check".into());
    }
    let exe_hash = format!("{:x}", Sha256::digest(fs::read(&exe).map_err(|e| e.to_string())?));
    let receipt = serde_json::json!({ "release": full_version, "archiveSha256": expected_digest, "exeSha256": exe_hash });
    fs::write(staging_dir.join(".devstackbox-release.json"), serde_json::to_vec(&receipt).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    ensure_runtime_idle(&target_dir).await?;
    let previous = php_root().join(format!(".previous-{}-{}", version, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()));
    publish_runtime(staging_dir, &target_dir, &previous)?;
    drop(staging);

    emit_progress(
        &app,
        PhpDownloadProgress {
            version: version.clone(),
            stage: "complete".to_string(),
            percent: 100,
            downloaded: zip_bytes.len() as u64,
            total: zip_bytes.len() as u64,
            message: Some(format!("PHP {} installed", full_version)),
        },
    );

    Ok(true)
}

fn publish_runtime(staging: &Path, target: &Path, backup: &Path) -> Result<(), String> {
    if backup.exists() { return Err("PHP backup path already exists; installation cancelled.".into()); }
    let had_previous = target.exists();
    if had_previous { fs::rename(target, backup).map_err(|e| e.to_string())?; }
    if let Err(error) = fs::rename(staging, target) {
        if had_previous {
            fs::rename(backup, target).map_err(|restore| format!("Publish failed: {error}; recovery failed: {restore}. Restore {} to {}.", backup.display(), target.display()))?;
        }
        return Err(format!("Could not publish PHP installation: {error}"));
    }
    if had_previous { let _ = fs::remove_dir_all(backup); }
    Ok(())
}

async fn ensure_runtime_idle(directory: &Path) -> Result<(), String> {
    // A pinned project may use this branch even when it is not globally active.
    if super::apache::get_apache_status().await?.running {
        return Err("Stop DevStackBox Apache before updating PHP, then start it again after the update.".into());
    }
    for name in ["php.exe", "php-cgi.exe"] {
        if !crate::utils::process::find_our_processes(name, &directory.join(name)).is_empty() {
            return Err("Close terminals and PHP processes using this runtime before updating it.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_php() -> Result<bool, String> {
    // PHP doesn't start/stop like a service, just return a status.
    Ok(true)
}

#[tauri::command]
pub async fn open_php_terminal(version: String) -> Result<String, String> {
    if !PHP_BRANCHES.contains(&version.as_str()) { return Err("Unsupported PHP version".into()); }
    let base_path = get_installation_path();
    let php_exe = php_branch_exe(&version);

    if !php_exe.exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS: new process runs detached, giving it a fresh console.
        // Using cmd /c start "" spawns an independent window via the shell so
        // Rust's inherited (GUI-app) stdio handles never reach the new CMD window
        // and the user can type normally.
        const DETACHED_PROCESS: u32 = 0x00000008;

        let php_dir = php_exe
            .parent()
            .ok_or_else(|| "Failed to resolve PHP directory".to_string())?;

        // Write a small batch file to avoid quoting hell in the /K command string.
        let bat_path = std::env::temp_dir().join(format!("dsb_php_{}_terminal.bat", version));
        let bat = format!(
            "@echo off\r\ntitle PHP {ver} Terminal - DevStackBox\r\ncd /d \"{base}\"\r\nset PHPRC=\"{config}\"\r\nset PATH={php};%PATH%\r\necho.\r\necho PHP {ver} terminal ready. Type 'php -v' to verify.\r\ncmd /k\r\n",
            ver = version,
            base = base_path.display(),
            php = php_dir.display(),
            config = crate::utils::paths::active_php_ini().display(),
        );
        std::fs::write(&bat_path, bat)
            .map_err(|e| format!("Failed to write terminal script: {}", e))?;

        // `start "" "path\to.bat"` opens a new CMD window independently.
        Command::new("cmd")
            .args([
                "/c",
                "start",
                "",
                bat_path.to_str().unwrap_or("dsb_terminal.bat"),
            ])
            .creation_flags(DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        let _ = base_path;
        return Err("open_php_terminal is currently implemented for Windows only".to_string());
    }

    Ok(format!("Opened PHP {} terminal", version))
}

// -- PHP Extensions ----------------------------------------------------------

/// Resolve a potentially full version string ("8.3.31") to the installed
/// branch directory name ("8.3").  Strategy: try exact first, then
/// major.minor prefix, then walk installed dirs for the longest prefix match.
fn resolve_branch(version: &str) -> String {
    let exact = php_branch_dir(version);
    if exact.exists() {
        return version.to_string();
    }
    // Try major.minor (first two dot-separated components).
    let parts: Vec<&str> = version.splitn(3, '.').collect();
    if parts.len() >= 2 {
        let mm = format!("{}.{}", parts[0], parts[1]);
        if php_branch_dir(&mm).exists() {
            return mm;
        }
    }
    // Fall back to scanning php/ for any dir that has version as a prefix.
    if let Ok(entries) = std::fs::read_dir(php_root()) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if version.starts_with(name) || name.starts_with(version) {
                    return name.to_string();
                }
            }
        }
    }
    version.to_string()
}

/// Strip a single trailing semicolon-comment and surrounding whitespace from
/// the value side of an `extension=<name>` directive.
/// e.g. `mbstring      ; depends on iconv` -> `mbstring`.
fn extract_ext_value(raw: &str) -> String {
    let no_comment = raw.split(';').next().unwrap_or("").trim();
    // Some inis use `extension="curl"`; strip quotes.
    let value = no_comment.trim_matches('"').trim();
    // Accept PHP's extension names and DLL spellings, but reject paths and
    // sample placeholders such as `/path/to/extension/mysqli.so`.
    if value.contains(['/', '\\']) { return String::new(); }
    let value = value.strip_suffix(".dll").or_else(|| value.strip_suffix(".so")).unwrap_or(value);
    let value = value.strip_prefix("php_").unwrap_or(value);
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return String::new();
    }
    value.to_string()
}

/// Returns Some(("extension"|"zend_extension", value, was_commented)) if the
/// trimmed line is an extension directive, otherwise None.
fn parse_ext_line(line: &str) -> Option<(&'static str, String, bool)> {
    let trimmed = line.trim_start();
    let (was_commented, rest) = if let Some(stripped) = trimmed.strip_prefix(';') {
        (true, stripped.trim_start())
    } else {
        (false, trimmed)
    };
    let (kind, after_kw) = if let Some(after) = rest.strip_prefix("zend_extension") {
        ("zend_extension", after)
    } else {
        let after = rest.strip_prefix("extension")?;
        ("extension", after)
    };
    let after_eq = after_kw.trim_start().strip_prefix('=')?;
    let value = extract_ext_value(after_eq);
    if value.is_empty() {
        return None;
    }
    Some((kind, value, was_commented))
}

#[tauri::command]
pub async fn list_php_extensions(version: String) -> Result<Vec<crate::types::PhpExtension>, String>
{
    use std::collections::BTreeMap;

    // The frontend may pass a full version string like "8.3.31" while the
    // directory is "php/8.3".  Resolve to the best matching installed dir.
    let branch = resolve_branch(&version);
    let branch_dir = php_branch_dir(&branch);
    if !branch_dir.exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    // 1. Discover DLLs shipped in ext/.
    let mut map: BTreeMap<String, crate::types::PhpExtension> = BTreeMap::new();
    let ext_dir = branch_dir.join("ext");
    if let Ok(entries) = fs::read_dir(&ext_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
                continue;
            };
            if !ext.eq_ignore_ascii_case("dll") {
                continue;
            }
            let name = stem.strip_prefix("php_").unwrap_or(stem).to_string();
            map.insert(
                name.clone(),
                crate::types::PhpExtension {
                    name,
                    enabled: false,
                    dll_present: true,
                },
            );
        }
    }

    let ini_path = crate::utils::paths::active_php_ini();
    if ini_path.exists() {
        let contents = fs::read_to_string(&ini_path).map_err(|e| e.to_string())?;
        for line in contents.lines() {
            if let Some((_kind, value, was_commented)) = parse_ext_line(line) {
                let entry = map
                    .entry(value.clone())
                    .or_insert_with(|| crate::types::PhpExtension {
                        name: value,
                        enabled: false,
                        dll_present: false,
                    });
                if !was_commented {
                    entry.enabled = true;
                }
            }
        }
    }

    Ok(map.into_values().collect())
}

#[tauri::command]
pub async fn toggle_php_extension(
    version: String,
    name: String,
    enable: bool,
) -> Result<bool, String> {
    let branch = resolve_branch(&version);
    if !check_active_php_version(&branch).await {
        return Err("Select this PHP version before changing its extensions.".into());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') || name.is_empty() {
        return Err("Invalid extension name".into());
    }
    let ini_path = crate::utils::paths::active_php_ini();
    if !ini_path.exists() {
        return Err(format!("php.ini not found for PHP {}", version));
    }

    let contents = fs::read_to_string(&ini_path).map_err(|e| e.to_string())?;
    let mut out_lines: Vec<String> = Vec::with_capacity(contents.lines().count() + 1);
    let mut found = false;

    for line in contents.lines() {
        if let Some((kind, value, was_commented)) = parse_ext_line(line) {
            if value.eq_ignore_ascii_case(&name) {
                found = true;
                let new_line = if enable {
                    if was_commented {
                        format!("{}={}", kind, value)
                    } else {
                        line.to_string()
                    }
                } else if was_commented {
                    line.to_string()
                } else {
                    format!(";{}={}", kind, value)
                };
                out_lines.push(new_line);
                continue;
            }
        }
        out_lines.push(line.to_string());
    }

    if !found && enable {
        // No existing directive to toggle; append a fresh one so the user can
        // enable extensions that ship as DLLs but were never listed in php.ini.
        if !out_lines.last().map(|l| l.is_empty()).unwrap_or(false) {
            out_lines.push(String::new());
        }
        out_lines.push(format!("extension={}", name));
    }

    let mut joined = out_lines.join("\n");
    // Preserve trailing newline behaviour.
    if contents.ends_with('\n') && !joined.ends_with('\n') {
        joined.push('\n');
    }
    fs::write(&ini_path, joined).map_err(|e| e.to_string())?;
    Ok(true)
}


#[cfg(test)]
mod download_tests {
    use std::fs;
    use sha2::Digest;
    use super::{parse_ext_line, pick_zip_url, meets_security_minimum, version_tuple};
    #[test]
    fn windows_build_revisions_are_supported_without_accepting_prereleases() {
        for (branch, version) in [("8.2", "8.2.35-1"), ("8.3", "8.3.36-1"), ("8.4", "8.4.27-1"), ("8.5", "8.5.12-1")] {
            assert!(meets_security_minimum(branch, version));
            let release = serde_json::json!({branch: {"version": version, "ts-vs17-x64": {"zip": {"path": "php-test.zip", "sha256": "a".repeat(64)}}}});
            assert_eq!(pick_zip_url(branch, &release).unwrap().0, version);
        }
        assert!(super::release_tuple("8.4.27-2") > super::release_tuple("8.4.27-1"));
        assert!(super::release_tuple("8.4.27-1") > super::release_tuple("8.4.27"));
        for invalid in ["8.4.27RC1", "8.4.27-RC1", "8.4.27-", "8.4.27-1-2", "8.4.27-+1"] {
            assert!(super::release_tuple(invalid).is_none());
        }
        assert!(super::runtime_matches_release("8.4.27", "8.4.27-1"));
        assert!(!super::runtime_matches_release("8.4.26", "8.4.27-1"));
        assert!(!super::runtime_matches_release("8.4.27-2", "8.4.27-1"));
    }

    #[test]
    fn receipt_tracks_revision_only_for_matching_executable() {
        let dir = std::env::temp_dir().join(format!("dsb-receipt-{}", crate::utils::database_io::unique_suffix()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("php.exe"), b"test-runtime").unwrap();
        let hash = format!("{:x}", super::Sha256::digest(b"test-runtime"));
        let receipt = serde_json::json!({"release": "8.4.27-1", "exeSha256": hash});
        fs::write(dir.join(".devstackbox-release.json"), receipt.to_string()).unwrap();
        assert_eq!(super::installed_release(&dir, "8.4.27"), "8.4.27-1");
        assert_eq!(super::installed_release(&dir, "8.4.28"), "8.4.28");
        fs::write(dir.join("php.exe"), b"replacement").unwrap();
        assert_eq!(super::installed_release(&dir, "8.4.27"), "8.4.27");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn failed_runtime_publish_restores_previous_files() {
        let root = std::env::temp_dir().join(format!("dsb-php-publish-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let target = root.join("8.3");
        let backup = root.join("backup");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("php.ini"), "custom=setting").unwrap();
        assert!(super::publish_runtime(&root.join("missing-stage"), &target, &backup).is_err());
        assert_eq!(std::fs::read_to_string(target.join("php.ini")).unwrap(), "custom=setting");
        assert!(!backup.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn security_baselines_reject_old_wrong_branch_and_prerelease_versions() {
        assert_eq!(super::PHP_BRANCHES, &["8.2", "8.3", "8.4", "8.5"]);
        for (branch, fixed, old) in [("8.2", "8.2.35", "8.2.34"), ("8.3", "8.3.36", "8.3.35"), ("8.4", "8.4.27", "8.4.26"), ("8.5", "8.5.12", "8.5.11")] {
            assert!(meets_security_minimum(branch, fixed));
            assert!(!meets_security_minimum(branch, old));
            assert!(!meets_security_minimum(branch, "8.6.0"));
        }
        assert!(!meets_security_minimum("8.1", "8.1.34"));
        assert!(!meets_security_minimum("8.5", "8.5.12RC1"));
        assert!(version_tuple("8.5.12") > version_tuple("8.5.9"));
        assert_eq!(version_tuple("8.5"), None);
    }
    #[test]
    fn release_requires_trusted_filename_and_checksum() {
        let mut release = serde_json::json!({"8.4": {"version": "8.4.27", "ts-vs17-x64": {"zip": {"path": "php-test.zip", "sha256": "a".repeat(64)}}}});
        assert!(pick_zip_url("8.4", &release).is_some());
        release["8.4"]["ts-vs17-x64"]["zip"]["path"] = "../other.zip".into();
        assert!(pick_zip_url("8.4", &release).is_none());
        release["8.4"]["ts-vs17-x64"]["zip"]["path"] = "php-test.zip".into();
        release["8.4"]["ts-vs17-x64"]["zip"]["sha256"] = "".into();
        assert!(pick_zip_url("8.4", &release).is_none());
    }

    #[test]
    fn stale_feed_cannot_install_a_vulnerable_runtime() {
        let release = serde_json::json!({"8.3": {"version": "8.3.35", "ts-vs16-x64": {"zip": {"path": "php-old.zip", "sha256": "a".repeat(64)}}}});
        assert!(pick_zip_url("8.3", &release).is_none());
    }

    #[test]
    fn parses_only_supported_extension_names() {
        assert_eq!(
            parse_ext_line("extension=php_mysqli.dll"),
            Some(("extension", "mysqli".to_string(), false))
        );
        assert_eq!(
            parse_ext_line("; extension=redis.so"),
            Some(("extension", "redis".to_string(), true))
        );
        assert_eq!(
            parse_ext_line("; extension=/path/to/extension/mysqli.so"),
            None
        );
    }
}
