// Validation and escaping for MySQL account DDL built for the CLI client.

/// MySQL string literal escaping: single quotes doubled per SQL standard.
pub fn escape_mysql_string_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn has_forbidden_sql_chars(s: &str) -> bool {
    s.chars().any(|c| {
        c.is_control()
            || c == ';'
            || c == '`'
            || c == '"'
            || c == '\''
            || c == '\\'
    })
}

/// MySQL account names: alphanumeric + underscore, max 32 chars (MySQL limit).
pub fn validate_mysql_account_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if name.len() > 32 {
        return Err("Username must be at most 32 characters".to_string());
    }
    if has_forbidden_sql_chars(name) {
        return Err("Username contains invalid characters".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
    {
        return Err(
            "Username may only contain letters, numbers, underscore, and $".to_string(),
        );
    }
    Ok(())
}

/// Host part of user@host - localhost, %, IPv4, or simple hostname labels.
pub fn validate_mysql_host(host: &str) -> Result<String, String> {
    let host = host.trim();
    if host.is_empty() {
        return Ok("localhost".to_string());
    }
    if host.len() > 255 {
        return Err("Host value is too long".to_string());
    }
    if has_forbidden_sql_chars(host) {
        return Err("Host contains invalid characters".to_string());
    }
    if host == "localhost" || host == "%" {
        return Ok(host.to_string());
    }
    // IPv4
    if host.chars().all(|c| c.is_ascii_digit() || c == '.')
        && host.split('.').count() <= 4
    {
        return Ok(host.to_string());
    }
    // Simple hostname (labels with dots/hyphens)
    if host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Ok(host.to_string());
    }
    Err("Invalid host value".to_string())
}

pub fn quote_mysql_user_host(user: &str, host: &str) -> Result<String, String> {
    validate_mysql_account_name(user)?;
    let host = validate_mysql_host(host)?;
    Ok(format!(
        "'{}'@'{}'",
        escape_mysql_string_literal(user.trim()),
        escape_mysql_string_literal(&host)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_doubles_single_quotes() {
        assert_eq!(escape_mysql_string_literal("a'b"), "a''b");
    }

    #[test]
    fn reject_injection_in_username() {
        assert!(validate_mysql_account_name("admin'; DROP").is_err());
    }

    #[test]
    fn accept_simple_host() {
        assert_eq!(validate_mysql_host("127.0.0.1").unwrap(), "127.0.0.1");
    }
}
