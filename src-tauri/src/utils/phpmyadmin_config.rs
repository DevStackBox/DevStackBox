use crate::utils::paths::{get_installation_path, get_user_data_root, to_apache_path};

const PHPMYADMIN_CONFIG_INC: &str =
    include_str!("../../../config/phpmyadmin.config.inc.php");

const PMA_IMPORT_CONFIG_VERSION: u32 = 1;

fn php_single_quoted_path(path: &str) -> String {
    format!("'{}'", path.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn user_phpmyadmin_dirs() -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
    let base = get_user_data_root().join("phpmyadmin");
    (
        base.join("upload"),
        base.join("save"),
        base.join("tmp"),
    )
}

/// Writes DevStackBox phpMyAdmin config when missing (e.g. after a bundle refresh without config.inc.php).
pub fn ensure_phpmyadmin_config_inc() -> Result<(), String> {
    let pma_dir = get_installation_path().join("phpmyadmin");
    if !pma_dir.is_dir() {
        return Ok(());
    }
    let config_path = pma_dir.join("config.inc.php");
    if config_path.exists() {
        return Ok(());
    }
    std::fs::write(&config_path, PHPMYADMIN_CONFIG_INC)
        .map_err(|e| format!("Failed to write phpMyAdmin config.inc.php: {e}"))?;
    println!("Created missing phpMyAdmin config at {}", config_path.display());
    Ok(())
}

fn replace_php_string_setting(content: &str, key: &str, new_value: &str) -> String {
    let needle = format!("$cfg['{key}']");
    let mut out = String::with_capacity(content.len() + 64);
    let mut replaced = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&needle) {
            out.push_str(&format!("{needle} = {new_value};\n"));
            replaced = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !replaced {
        out.push_str(&format!("{needle} = {new_value};\n"));
    }
    out
}

fn is_bundled_relative_dir(value: &str) -> bool {
    let v = value.trim().trim_matches(';').trim();
    matches!(v, "'./upload'" | "\"./upload\"" | "'./save'" | "\"./save\"" | "'./tmp'" | "\"./tmp\"")
        || v.contains("./upload")
        || v.contains("./save")
        || v.contains("./tmp")
}

/// Migrate UploadDir/SaveDir/TempDir to user-data paths and raise ExecTimeLimit when still at bundled defaults.
pub fn patch_phpmyadmin_config() -> Result<(), String> {
    ensure_phpmyadmin_config_inc()?;
    let pma_dir = get_installation_path().join("phpmyadmin");
    let config_path = pma_dir.join("config.inc.php");
    if !config_path.is_file() {
        return Ok(());
    }

    let (upload, save, tmp) = user_phpmyadmin_dirs();
    for dir in [&upload, &save, &tmp] {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create phpMyAdmin data dir {}: {e}", dir.display()))?;
    }

    let upload_s = php_single_quoted_path(&to_apache_path(&upload));
    let save_s = php_single_quoted_path(&to_apache_path(&save));
    let tmp_s = php_single_quoted_path(&to_apache_path(&tmp));

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read phpMyAdmin config: {e}"))?;

    let mut updated = content.clone();
    // Config files may end the PHP block explicitly. Keep appended settings in
    // that block instead of emitting them as page text.
    if updated.trim_end().ends_with("?>") {
        updated = updated.trim_end().trim_end_matches("?>").to_owned();
        updated.push('\n');
    }
    // Installed configurations survive upgrades; append the packaged UI policy
    // without replacing connection credentials, ports or user directory settings.
    if !updated.contains("/devstackbox-theme.inc.php") {
        updated.push_str("\nif (is_file(__DIR__ . '/devstackbox-theme.inc.php')) {\n    include __DIR__ . '/devstackbox-theme.inc.php';\n}\n");
    }
    if content.contains("$cfg['UploadDir']") {
        if let Some(line) = content.lines().find(|l| l.contains("$cfg['UploadDir']")) {
            if is_bundled_relative_dir(line.split('=').nth(1).unwrap_or("")) {
                updated = replace_php_string_setting(&updated, "UploadDir", &upload_s);
            }
        }
    } else {
        updated = replace_php_string_setting(&updated, "UploadDir", &upload_s);
    }
    if content.contains("$cfg['SaveDir']") {
        if let Some(line) = content.lines().find(|l| l.contains("$cfg['SaveDir']")) {
            if is_bundled_relative_dir(line.split('=').nth(1).unwrap_or("")) {
                updated = replace_php_string_setting(&updated, "SaveDir", &save_s);
            }
        }
    } else {
        updated = replace_php_string_setting(&updated, "SaveDir", &save_s);
    }
    if content.contains("$cfg['TempDir']") {
        if let Some(line) = content.lines().find(|l| l.contains("$cfg['TempDir']")) {
            if is_bundled_relative_dir(line.split('=').nth(1).unwrap_or("")) {
                updated = replace_php_string_setting(&updated, "TempDir", &tmp_s);
            }
        }
    } else {
        updated = replace_php_string_setting(&updated, "TempDir", &tmp_s);
    }

    if updated.contains("$cfg['ExecTimeLimit'] = 300") {
        updated = updated.replace("$cfg['ExecTimeLimit'] = 300", "$cfg['ExecTimeLimit'] = 600");
    }

    if !updated.contains("phpMyAdminImportConfigVersion:") {
        updated.push_str(&format!(
            "\n// phpMyAdminImportConfigVersion: {PMA_IMPORT_CONFIG_VERSION}\n"
        ));
    }

    if updated != content {
        std::fs::write(&config_path, updated)
            .map_err(|e| format!("Failed to update phpMyAdmin config: {e}"))?;
    }
    Ok(())
}
