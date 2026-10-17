//! Import projects from a legacy XAMPP installation.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::utils::paths::{get_installation_path, user_www_dir};

const XAMPP_CANDIDATES: &[&str] = &["C:\\xampp", "C:\\XAMPP"];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XamppDetection {
    pub path: String,
    pub has_htdocs: bool,
    pub htdocs_file_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XamppImportResult {
    pub copied_files: u32,
    pub destination: String,
    pub source: String,
}

fn count_files(dir: &Path, limit: u32) -> u32 {
    let Ok(read) = fs::read_dir(dir) else {
        return 0;
    };
    read.filter_map(Result::ok).take(limit as usize).count() as u32
}

#[tauri::command]
pub fn detect_xampp_installations() -> Result<Vec<XamppDetection>, String> {
    let mut found = Vec::new();
    for candidate in XAMPP_CANDIDATES {
        let root = PathBuf::from(candidate);
        if !root.is_dir() {
            continue;
        }
        let htdocs = root.join("htdocs");
        found.push(XamppDetection {
            path: root.to_string_lossy().into_owned(),
            has_htdocs: htdocs.is_dir(),
            htdocs_file_count: if htdocs.is_dir() {
                count_files(&htdocs, 10_000)
            } else {
                0
            },
        });
    }
    Ok(found)
}

fn copy_tree(src: &Path, dest: &Path) -> Result<u32, String> {
    if !src.is_dir() {
        return Err(format!("Source folder not found: {}", src.display()));
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut copied = 0u32;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let from = entry.path();
        let to = dest.join(&name);
        if from.is_dir() {
            copied = copied.saturating_add(copy_tree(&from, &to)?);
        } else {
            if to.exists() {
                continue;
            }
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
            copied += 1;
        }
    }
    Ok(copied)
}

#[tauri::command]
pub fn import_from_xampp(xampp_root: String, copy_htdocs: bool) -> Result<XamppImportResult, String> {
    if !copy_htdocs {
        return Err("Nothing to import".into());
    }
    let root = PathBuf::from(&xampp_root);
    if !root.is_dir() {
        return Err(format!("XAMPP path not found: {xampp_root}"));
    }
    let htdocs = root.join("htdocs");
    let www = user_www_dir();
    if get_installation_path().as_os_str().is_empty() {
        return Err("DevStackBox installation path is unknown".into());
    }
    let copied = copy_tree(&htdocs, &www)?;
    Ok(XamppImportResult {
        copied_files: copied,
        destination: www.to_string_lossy().into_owned(),
        source: htdocs.to_string_lossy().into_owned(),
    })
}
