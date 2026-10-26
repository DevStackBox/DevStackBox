// One-time migration and explicit apply for PHP upload/import limits (global php.ini).

pub const PHP_IMPORT_LIMITS_VERSION: u32 = 1;

pub const RECOMMENDED_UPLOAD_MAX: &str = "512M";
pub const RECOMMENDED_POST_MAX: &str = "544M";
pub const RECOMMENDED_MAX_EXECUTION: &str = "600";
pub const RECOMMENDED_MAX_INPUT: &str = "600";
pub const RECOMMENDED_MEMORY: &str = "512M";

fn normalize_size(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_ascii_lowercase()
        .replace(' ', "")
}

/// Read a simple `directive = value` from php.ini (first non-comment match).
pub fn read_ini_directive(content: &str, directive: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, val)) = trimmed.split_once('=') {
            if key.trim().eq_ignore_ascii_case(directive) {
                return Some(val.trim().to_string());
            }
        }
    }
    None
}

pub fn parse_php_import_limits_version(content: &str) -> Option<u32> {
    for line in content.lines() {
        let trimmed = line.trim();
        let body = trimmed
            .strip_prefix(';')
            .or_else(|| trimmed.strip_prefix('#'))
            .map(str::trim)
            .unwrap_or(trimmed);
        if let Some(rest) = body.strip_prefix("phpImportLimitsVersion:") {
            return rest.trim().parse().ok();
        }
    }
    None
}

fn is_legacy_default(content: &str) -> bool {
    let upload = read_ini_directive(content, "upload_max_filesize")
        .map(|v| normalize_size(&v))
        .unwrap_or_default();
    let post = read_ini_directive(content, "post_max_size")
        .map(|v| normalize_size(&v))
        .unwrap_or_default();
    let exec = read_ini_directive(content, "max_execution_time")
        .map(|v| v.trim().to_string())
        .unwrap_or_default();
    let input = read_ini_directive(content, "max_input_time")
        .map(|v| v.trim().to_string())
        .unwrap_or_default();
    let memory = read_ini_directive(content, "memory_limit")
        .map(|v| normalize_size(&v))
        .unwrap_or_default();

    (upload == "64m" || upload.is_empty())
        && (post == "64m" || post.is_empty())
        && (exec == "30" || exec.is_empty())
        && (input == "60" || input == "-1" || input.is_empty())
        && (memory == "256m" || memory.is_empty())
}

fn set_or_append_directive(content: &str, directive: &str, value: &str) -> String {
    let mut found = false;
    let mut out = String::with_capacity(content.len() + 64);
    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with(';')
            && !trimmed.starts_with('#')
            && trimmed.split_once('=')
                .is_some_and(|(k, _)| k.trim().eq_ignore_ascii_case(directive))
        {
            out.push_str(&format!("{directive} = {value}\n"));
            found = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !found {
        out.push_str(&format!("\n; DevStackBox import limits\n{directive} = {value}\n"));
    }
    out
}

pub fn apply_recommended_import_limits(content: &str, upload_tmp_dir: Option<&str>) -> String {
    let mut c = content.to_string();
    c = set_or_append_directive(&c, "upload_max_filesize", RECOMMENDED_UPLOAD_MAX);
    c = set_or_append_directive(&c, "post_max_size", RECOMMENDED_POST_MAX);
    c = set_or_append_directive(&c, "max_execution_time", RECOMMENDED_MAX_EXECUTION);
    c = set_or_append_directive(&c, "max_input_time", RECOMMENDED_MAX_INPUT);
    c = set_or_append_directive(&c, "memory_limit", RECOMMENDED_MEMORY);
    if let Some(tmp) = upload_tmp_dir {
        c = set_or_append_directive(&c, "upload_tmp_dir", &format!("\"{tmp}\""));
    }
    if !c.contains("phpImportLimitsVersion:") {
        c.push_str(&format!(
            "\n; phpImportLimitsVersion: {}\n",
            PHP_IMPORT_LIMITS_VERSION
        ));
    } else {
        c = c
            .lines()
            .map(|line| {
                if line.trim().starts_with("; phpImportLimitsVersion:") {
                    format!("; phpImportLimitsVersion: {}", PHP_IMPORT_LIMITS_VERSION)
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !c.ends_with('\n') {
            c.push('\n');
        }
    }
    c
}

/// Migrate only when still on legacy DevStackBox defaults and not yet at import limits v1.
pub fn maybe_migrate_php_import_limits(content: &str, upload_tmp_dir: &str) -> Option<String> {
    if parse_php_import_limits_version(content).unwrap_or(0) >= PHP_IMPORT_LIMITS_VERSION {
        return None;
    }
    if !is_legacy_default(content) {
        return None;
    }
    Some(apply_recommended_import_limits(
        content,
        crate::utils::php_defaults::needs_default(content, "upload_tmp_dir").then_some(upload_tmp_dir),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_migration_keeps_custom_upload_directory() {
        let content = "upload_tmp_dir=\"D:/custom uploads\"\n";
        let updated = maybe_migrate_php_import_limits(content, "C:/managed/tmp").unwrap();
        assert!(updated.contains("upload_tmp_dir=\"D:/custom uploads\""));
        assert!(!updated.contains("C:/managed/tmp"));
    }

    #[test]
    fn legacy_defaults_are_detected() {
        let ini = "upload_max_filesize=64M\npost_max_size=64M\nmax_execution_time = 30\nmax_input_time = 60\nmemory_limit=256M\n";
        assert!(is_legacy_default(ini));
    }

    #[test]
    fn custom_upload_not_legacy() {
        let ini = "upload_max_filesize=1G\npost_max_size=64M\nmax_execution_time = 30\nmax_input_time = 60\nmemory_limit=256M\n";
        assert!(!is_legacy_default(ini));
    }

    #[test]
    fn apply_sets_post_larger_than_upload() {
        let out = apply_recommended_import_limits("upload_max_filesize=64M\n", None);
        assert!(out.contains("upload_max_filesize = 512M"));
        assert!(out.contains("post_max_size = 544M"));
    }
}
