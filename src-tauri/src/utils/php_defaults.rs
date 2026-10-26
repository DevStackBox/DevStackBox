//! Shared by the desktop app and the small console PHP launcher. No GUI dependencies.
use std::path::Path;

pub const EXTENSIONS: &[&str] = &["mysqli", "pdo_mysql", "pdo_sqlite", "sqlite3", "mbstring", "openssl", "curl", "gd", "zip", "intl", "fileinfo", "exif", "sockets", "sodium"];

fn directive(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.starts_with(';') || line.starts_with('#') { return None; }
    line.split_once('=').map(|(key, value)| (key.trim(), value.trim()))
}

fn value(raw: &str) -> &str {
    if raw.starts_with('"') || raw.starts_with('\'') {
        return raw[1..].split(raw.chars().next().unwrap()).next().unwrap_or("");
    }
    raw.split(';').next().unwrap_or("").trim()
}

pub fn needs_default(content: &str, name: &str) -> bool {
    !content.lines().filter_map(directive).filter(|(key, _)| key.eq_ignore_ascii_case(name)).last()
        .is_some_and(|(_, raw)| !value(raw).is_empty())
}

/// Fill missing/empty temporary paths, independently of old upload-limit migrations.
/// Nonempty custom paths remain user-owned, even when currently unavailable.
pub fn temporary_defaults(content: &str, tmp: &str) -> String {
    let mut result = content.to_owned();
    for name in ["sys_temp_dir", "upload_tmp_dir"] {
        if !needs_default(&result, name) { continue; }
        let kept = result.lines().filter(|line| !directive(line).is_some_and(|(key, _)| key.eq_ignore_ascii_case(name))).collect::<Vec<_>>().join("\n");
        result = format!("{name} = \"{tmp}\"\n{kept}\n");
    }
    result
}

/// New profiles only: never re-enable extensions a user disabled in an existing ini.
pub fn enable_extensions(content: String, ext: &Path) -> String {
    let mut additions = String::new();
    for name in EXTENSIONS {
        if !ext.join(format!("php_{name}.dll")).is_file() { continue; }
        let active = content.lines().filter_map(directive).any(|(key, raw)| {
            let val = value(raw).replace('\\', "/");
            let file = val.rsplit('/').next().unwrap_or("");
            key.eq_ignore_ascii_case("extension") && (file.eq_ignore_ascii_case(name) || file.eq_ignore_ascii_case(&format!("php_{name}.dll")))
        });
        if !active { additions.push_str(&format!("extension={name}\n")); }
    }
    format!("{additions}{content}")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn temps_preserve_custom_and_are_idempotent() {
        let source = "; sys_temp_dir =\nupload_tmp_dir = \"D:/custom uploads\" ; custom\n; phpImportLimitsVersion: 1\n";
        let result = temporary_defaults(source, "C:/Users/Test User/tmp");
        assert!(result.contains("sys_temp_dir = \"C:/Users/Test User/tmp\""));
        assert!(result.contains("upload_tmp_dir = \"D:/custom uploads\" ; custom"));
        assert_eq!(result, temporary_defaults(&result, "elsewhere"));
        let blank = temporary_defaults("SYS_TEMP_DIR=\"\" ; unset\nsys_temp_dir=\n", "C:/tmp");
        assert_eq!(blank.matches("sys_temp_dir =").count(), 1);
    }
    #[test]
    fn extension_defaults_match_exact_names_and_quoted_dlls() {
        let root = std::env::temp_dir().join(format!("dsb-ext-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        for name in ["mysqli", "pdo_sqlite", "sqlite3"] { std::fs::write(root.join(format!("php_{name}.dll")), "").unwrap(); }
        let original = "extension = \"php_mysqli.dll\" ; enabled\n;extension=pdo_sqlite\n";
        let result = enable_extensions(original.into(), &root);
        assert_eq!(result.matches("php_mysqli.dll").count(), 1);
        assert!(result.contains("extension=pdo_sqlite\n"));
        assert!(result.contains("extension=sqlite3\n"));
        assert!(!result.contains("extension=imagick"));
        assert_eq!(result, enable_extensions(result.clone(), &root));
        std::fs::remove_dir_all(root).unwrap();
    }
}
