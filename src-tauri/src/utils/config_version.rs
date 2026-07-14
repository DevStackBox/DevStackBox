// Shared config version parsing and migration helpers.
//
// All managed config files use a header line:
//   # configVersion: N

/// Parse `# configVersion: N` (or `; configVersion=N`) from config text.
pub fn parse_config_version(content: &str) -> Option<u32> {
    for line in content.lines() {
        let trimmed = line.trim();
        let body = trimmed
            .strip_prefix('#')
            .or_else(|| trimmed.strip_prefix(';'))
            .map(str::trim)
            .unwrap_or(trimmed);

        if let Some(rest) = body
            .strip_prefix("configVersion:")
            .or_else(|| body.strip_prefix("configVersion="))
        {
            if let Ok(version) = rest.trim().parse::<u32>() {
                return Some(version);
            }
        }
    }
    None
}

/// Returns true when the on-disk config is missing a version or is older than `current`.
pub fn needs_config_migration(content: &str, current: u32) -> bool {
    parse_config_version(content)
        .map(|v| v < current)
        .unwrap_or(true)
}
