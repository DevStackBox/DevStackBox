// PHP commands.

use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::types::{PHPVersionInfo, ServiceInfo};
use crate::utils::paths::{get_installation_path, to_apache_path, user_config_dir, user_sessions_dir};

// Branches we surface in the UI. The bundled default is 8.3; the others are
// downloadable on demand (Roadmap Phase 3.1).
const PHP_BRANCHES: &[&str] = &["8.1", "8.2", "8.3", "8.4"];

fn php_root() -> PathBuf {
    get_installation_path().join("php")
}

fn php_branch_dir(version: &str) -> PathBuf {
    php_root().join(version)
}

fn php_branch_exe(version: &str) -> PathBuf {
    php_branch_dir(version).join("php.exe")
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
        let default_exe = php_branch_exe("8.3");
        if !default_exe.exists() {
            return None;
        }
        default_exe
    };

    match Command::new(&exe).arg("--version").output() {
        Ok(output) => {
            // `php --version` can emit "PHP Startup: ..." warning lines to
            // stdout before the actual banner. We must look specifically for a
            // line that starts with "PHP " followed by a digit (the real
            // banner: e.g. "PHP 8.2.12 (cli) (built: ...)").
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            for line in combined.lines() {
                let trimmed = line.trim_start();
                if let Some(rest) = trimmed.strip_prefix("PHP ") {
                    if rest.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                        if let Some(end) = rest.find(' ') {
                            return Some(rest[..end].to_string());
                        }
                        return Some(rest.to_string());
                    }
                }
            }
            None
        }
        Err(_) => None,
    }
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
    // No junction exists yet (fresh install). The bundled default "8.3" is
    // considered active as long as its exe is present.
    if version == "8.3" {
        return php_branch_exe("8.3").exists();
    }
    false
}

async fn update_php_config(_version: &str) -> Result<(), String> {
    // The httpd.conf ScriptAlias points to php/current/ (a junction).
    // Switching PHP versions only requires updating the junction target,
    // which switch_php_version already does via mklink /J.
    // Apache picks up the change on next restart - no conf rewrite needed.
    Ok(())
}

// Extensions required for phpMyAdmin and Laravel projects.  Each entry is
// (extension_name, dll_filename).  Only extensions whose DLL actually exists
// in the active PHP ext/ directory are activated; missing ones are skipped.
const ESSENTIAL_EXTENSIONS: &[(&str, &str)] = &[
    ("mysqli",     "php_mysqli.dll"),
    ("pdo_mysql",  "php_pdo_mysql.dll"),
    ("mbstring",   "php_mbstring.dll"),
    ("openssl",    "php_openssl.dll"),
    ("curl",       "php_curl.dll"),
    ("gd",         "php_gd.dll"),
    ("zip",        "php_zip.dll"),
    ("intl",       "php_intl.dll"),
    ("fileinfo",   "php_fileinfo.dll"),
    ("exif",       "php_exif.dll"),
    ("sockets",    "php_sockets.dll"),
    ("sodium",     "php_sodium.dll"),
];

// Scans `content` for each essential extension and enables it if:
// - the DLL exists in `ext_dir`
// - no un-commented `extension=NAME` line already exists
// If a commented-out `;extension=...NAME...` line is found it is uncommented,
// otherwise `extension=NAME` is appended at the end.
fn enable_essential_extensions(content: String, ext_dir: &std::path::Path) -> String {
    let mut result = content;

    for (name, dll) in ESSENTIAL_EXTENSIONS {
        // Skip if DLL is not present in this PHP build.
        if !ext_dir.join(dll).exists() {
            continue;
        }

        // Check if already actively enabled (line not starting with ;).
        let already_active = result.lines().any(|l| {
            let t = l.trim();
            !t.starts_with(';')
                && (t.eq_ignore_ascii_case(&format!("extension={}", name))
                    || t.eq_ignore_ascii_case(&format!("extension={}.so", name))
                    || t.eq_ignore_ascii_case(&format!("extension=php_{}.dll", name))
                    || t.eq_ignore_ascii_case(&format!("extension={}", dll)))
        });
        if already_active {
            continue;
        }

        // Try to uncomment an existing commented line for this extension.
        let lower_name = name.to_ascii_lowercase();
        let uncommented = {
            let mut found = false;
            let new: String = result
                .lines()
                .map(|l| {
                    let t = l.trim();
                    if !found
                        && t.starts_with(';')
                        && t.to_ascii_lowercase().contains(&format!("extension={}", lower_name))
                    {
                        found = true;
                        format!("extension={}\n", name)
                    } else {
                        format!("{}\n", l)
                    }
                })
                .collect();
            if found { Some(new) } else { None }
        };

        if let Some(new_content) = uncommented {
            result = new_content;
        } else {
            // Extension not mentioned at all - append it.
            result.push_str(&format!("extension={}\n", name));
        }
    }

    result
}

// Ensures the active PHP's php.ini has the minimum settings required for
// DevStackBox to work (session path, extension_dir, essential extensions).
// Called by start_apache on every start.
//
// IMPORTANT: this function writes to the USER CONFIG directory
// (%LOCALAPPDATA%\DevStackBox\config\php.ini), never to the installation
// directory.  This keeps the bundled php/*/php.ini pristine and unmodified
// so it can be committed to git and distributed through the installer
// without containing any machine-specific paths.
pub fn patch_php_ini() {
    // Locate the bundled (template) php.ini from the installation directory.
    let template_ini = {
        let current = php_root().join("current").join("php.ini");
        if current.exists() {
            current
        } else {
            php_root().join("8.3").join("php.ini")
        }
    };

    if !template_ini.exists() {
        return;
    }

    // The user-specific php.ini lives in the user config dir so it is
    // never committed to the repository or bundled in the installer.
    let php_ini = user_config_dir().join("php.ini");

    // Seed from the bundled template on first run.
    if !php_ini.exists() {
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
    let ext_dir = template_ini
        .parent()
        .map(|p| p.join("ext"))
        .unwrap_or_else(|| php_root().join("8.3").join("ext"));
    let ext_dir_str = to_apache_path(&ext_dir);

    // Sessions go under the user data root so PHP CGI can always write there.
    let sessions_str = to_apache_path(&user_sessions_dir());

    let mut new_content = String::with_capacity(content.len() + 256);
    let mut session_save_path_set = false;
    let mut extension_dir_set = false;

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

    // Enable essential extensions if not already active.
    new_content = enable_essential_extensions(new_content, &ext_dir);

    let _ = std::fs::write(&php_ini, new_content);
    println!("php.ini patched at user config dir: session.save_path={} extension_dir={}", sessions_str, ext_dir_str);
}

#[tauri::command]
pub async fn get_php_versions() -> Result<Vec<PHPVersionInfo>, String> {
    let mut versions = Vec::new();

    for version in PHP_BRANCHES {
        let exe = php_branch_exe(version);
        let installed = exe.exists();

        let active = if installed {
            check_active_php_version(version).await
        } else {
            false
        };

        versions.push(PHPVersionInfo {
            version: (*version).to_string(),
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
    let exe = php_branch_exe(&version);
    if !exe.exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    let current_link = php_root().join("current");
    let branch_dir = php_branch_dir(&version);

    if current_link.exists() {
        fs::remove_dir_all(&current_link).map_err(|e| e.to_string())?;
    }

    // `mklink` is a cmd.exe builtin, not a standalone exe, so it must be invoked via `cmd /C`.
    match Command::new("cmd")
        .args([
            "/C",
            "mklink",
            "/J",
            &current_link.display().to_string(),
            &branch_dir.display().to_string(),
        ])
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(format!(
                    "Failed to switch PHP version (mklink failed). \
                    On some systems junction creation requires admin rights.\n\
                    stdout: {}\nstderr: {}",
                    stdout.trim(),
                    stderr.trim()
                ));
            }
            update_php_config(&version).await?;
            Ok(true)
        }
        Err(e) => Err(format!("Failed to switch PHP version: {}", e)),
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

fn pick_zip_url(branch: &str, releases_json: &serde_json::Value) -> Option<(String, String)> {
    // releases.json shape (excerpt):
    // { "8.3": { "version": "8.3.31",
    //            "ts-vs16-x64": { "zip": { "path": "php-8.3.31-Win32-vs16-x64.zip" } } } }
    //
    // We want the thread-safe x64 build, which lives under the
    // "ts-vs16-x64" key (or "ts-vs17-x64" for newer branches such as 8.4).
    let branch_obj = releases_json.get(branch)?;
    let full_version = branch_obj.get("version")?.as_str()?.to_string();
    let ts = branch_obj
        .get("ts-vs17-x64")
        .or_else(|| branch_obj.get("ts-vs16-x64"))?;
    let zip = ts.get("zip")?;
    let path = zip.get("path")?.as_str()?;
    let url = format!("https://windows.php.net/downloads/releases/{}", path);
    Some((full_version, url))
}

async fn resolve_php_zip_url(branch: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .user_agent("DevStackBox")
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
    pick_zip_url(branch, &json)
        .ok_or_else(|| format!("No Windows VS16 x64 TS build listed for PHP {}", branch))
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
    let mut downloaded: u64 = 0;
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut stream = resp.bytes_stream();
    let mut last_percent: u32 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Download interrupted: {}", e))?;
        downloaded += bytes.len() as u64;
        buf.extend_from_slice(&bytes);

        let percent = if total > 0 {
            ((downloaded * 100) / total) as u32
        } else {
            0
        };
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
            None => continue,
        };
        let out_path = target_dir.join(&rel_path);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut data = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        out.write_all(&data).map_err(|e| e.to_string())?;
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
    let target_dir = php_branch_dir(&version);
    if target_dir.join("php.exe").exists() {
        emit_progress(
            &app,
            PhpDownloadProgress {
                version: version.clone(),
                stage: "complete".to_string(),
                percent: 100,
                downloaded: 0,
                total: 0,
                message: Some("Already installed".to_string()),
            },
        );
        return Ok(true);
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

    let (full_version, url) = match resolve_php_zip_url(&version).await {
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

    if let Err(e) = extract_zip_to(&zip_bytes, &target_dir) {
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
    if let Err(e) = write_default_php_ini(&target_dir) {
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

    let exe = target_dir.join("php.exe");
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

#[tauri::command]
pub async fn toggle_php() -> Result<bool, String> {
    // PHP doesn't start/stop like a service, just return a status.
    Ok(true)
}

#[tauri::command]
pub async fn open_php_terminal(version: String) -> Result<String, String> {
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
            "@echo off\r\ntitle PHP {ver} Terminal - DevStackBox\r\ncd /d \"{base}\"\r\nset PATH={php};%PATH%\r\necho.\r\necho PHP {ver} terminal ready. Type 'php -v' to verify.\r\ncmd /k\r\n",
            ver = version,
            base = base_path.display(),
            php = php_dir.display(),
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
    no_comment.trim_matches('"').trim().to_string()
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
    } else if let Some(after) = rest.strip_prefix("extension") {
        ("extension", after)
    } else {
        return None;
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

    let ini_path = branch_dir.join("php.ini");
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
    let branch_dir = php_branch_dir(&branch);
    let ini_path = branch_dir.join("php.ini");
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

