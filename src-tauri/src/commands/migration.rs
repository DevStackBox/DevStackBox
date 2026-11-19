//! Import projects from a legacy XAMPP installation.

use std::fs;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::utils::paths::{get_installation_path, user_www_dir};

const XAMPP_CANDIDATES: &[&str] = &["C:\\xampp", "C:\\XAMPP"];

// Candidates may differ only in spelling on Windows. Keep the first display path.
fn unique_candidates<'a>(candidates: &'a [&'a str]) -> Vec<&'a str> {
    let mut seen = HashSet::new();
    candidates.iter().copied().filter(|candidate| {
        let key = candidate.replace('/', "\\").trim_end_matches('\\').to_lowercase();
        seen.insert(key)
    }).collect()
}

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
    for candidate in unique_candidates(XAMPP_CANDIDATES) {
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

#[cfg(test)]
mod detection_tests {
    use super::unique_candidates;

    #[test]
    fn deduplicates_windows_spelling_but_preserves_distinct_installations() {
        assert_eq!(
            unique_candidates(&["C:\\xampp", "C:\\XAMPP\\", "c:/xampp/", "D:\\xampp"]),
            vec!["C:\\xampp", "D:\\xampp"]
        );
    }
}

fn copy_tree(src: &Path, dest: &Path) -> Result<u32, String> {
    reject_link(src)?;
    if !src.is_dir() {
        return Err(format!("Source folder not found: {}", src.display()));
    }
    if dest.exists() { reject_link(dest)?; }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut copied = 0u32;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let from = entry.path();
        let to = dest.join(&name);
        reject_link(&from)?;
        if to.exists() { reject_link(&to)?; }
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

fn reject_link(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt;
      if metadata.file_attributes() & 0x400 != 0 { return Err("Linked migration paths are unsupported".into()); }
    }
    if metadata.file_type().is_symlink() { return Err("Linked migration paths are unsupported".into()); }
    Ok(())
}

#[cfg(all(test, windows))]
mod link_tests {
    use super::*;
    #[test]
    fn rejects_junction_cycle_without_copying() {
        let root = std::env::temp_dir().join(crate::utils::database_io::unique_suffix());
        fs::create_dir(&root).unwrap();
        let link = root.join("cycle");
        let status = crate::utils::process::create_hidden_command("cmd.exe").args(["/c", "mklink", "/J"]).arg(&link).arg(&root).output().unwrap();
        assert!(status.status.success());
        assert!(reject_link(&link).is_err());
        fs::remove_dir(&link).unwrap();
        fs::remove_dir(root).unwrap();
    }
}
