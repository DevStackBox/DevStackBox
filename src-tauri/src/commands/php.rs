// PHP commands.

use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::types::{PHPVersionInfo, ServiceInfo};
use crate::utils::paths::{get_installation_path, user_config_dir};

// Branches we surface in the UI. The bundled default is 8.2; the others are
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
        let default_exe = php_branch_exe("8.2");
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
    false
}

async fn update_php_config(version: &str) -> Result<(), String> {
    let apache_config_path = user_config_dir().join("httpd.conf");
    if apache_config_path.exists() {
        let content = fs::read_to_string(&apache_config_path).map_err(|e| e.to_string())?;
        let updated_content = content.replace(
            "php/php8apache2_4.dll",
            &format!("php/current/php{}apache2_4.dll", version.replace('.', "")),
        );
        fs::write(&apache_config_path, updated_content).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    // { "8.3": { "version": "8.3.13", "ts": { "zip": { "path": "php-8.3.13-Win32-vs16-x64.zip" } } } }
    let branch_obj = releases_json.get(branch)?;
    let full_version = branch_obj.get("version")?.as_str()?.to_string();
    let ts = branch_obj.get("ts")?;
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
        let php_dir = php_exe
            .parent()
            .ok_or_else(|| "Failed to resolve PHP directory".to_string())?;

        let command = format!(
            "cd /d \"{}\" && set PATH={}\\;%%PATH%% && php --version",
            base_path.display(),
            php_dir.display()
        );

        Command::new("cmd")
            .args(["/K", &command])
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
