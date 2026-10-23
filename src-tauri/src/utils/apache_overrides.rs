//! Safe baseline for directory walking, before site-specific overrides apply.
pub const BASELINE: &str = "# DevStackBox directory override baseline v1\n<Directory \"/\">\n    AllowOverride None\n    AllowOverrideList None\n</Directory>\n";

pub fn with_baseline(content: &str) -> String {
    if content.replace("\r\n", "\n").contains(BASELINE) {
        return content.to_owned();
    }
    // Prepend so explicit administrator policies later in the file still win.
    // More-specific document-root blocks continue to enable .htaccess.
    format!("{BASELINE}{content}")
}

/// Stage and syntax-check the additive migration without regenerating site records.
pub fn migrate(path: &std::path::Path, apache: &std::path::Path) -> Result<(), String> {
    let original = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let updated = with_baseline(&original);
    if updated == original { return Ok(()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_nanos();
    let staged = path.with_extension(format!("{stamp}.pending.conf"));
    let backup = path.with_extension(format!("{stamp}.pre-overrides.conf"));
    std::fs::write(&staged, updated).map_err(|e| e.to_string())?;
    let result = (|| {
        let output = crate::utils::process::create_hidden_command(&apache.to_string_lossy())
            .arg("-f").arg(&staged).arg("-t").output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(format!("Apache directory migration rejected; original configuration retained: {}", String::from_utf8_lossy(&output.stderr)));
        }
        std::fs::copy(path, &backup).map_err(|e| e.to_string())?;
        std::fs::rename(&staged, path).map_err(|e| format!("Cannot apply Apache directory migration: {e}"))
    })();
    let _ = std::fs::remove_file(staged);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_custom_sites_ports_and_parent_policies() {
        let original = "Listen 127.0.0.1:8080\r\n<Directory \"D:/My Sites\">\r\nAllowOverride All\r\n</Directory>\r\nIncludeOptional sites.conf\r\n";
        let migrated = with_baseline(original);
        assert!(migrated.ends_with(original));
        assert_eq!(with_baseline(&migrated), migrated);
        let windows_lines = migrated.replace("\r\n", "\n").replace('\n', "\r\n");
        assert_eq!(with_baseline(&windows_lines), windows_lines);
        assert!(migrated.starts_with(BASELINE));
    }

    #[test]
    fn validation_failure_does_not_replace_original() {
        let dir = std::env::temp_dir().join(format!("dsb-overrides-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("httpd.conf");
        let original = "Listen 127.0.0.1:8080\n# custom config\n";
        std::fs::write(&file, original).unwrap();
        assert!(migrate(&file, &dir.join("missing-apache.exe")).is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_file(file).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
