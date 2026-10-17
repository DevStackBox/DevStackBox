// Parse Apache Listen and MySQL port from user config files.

use crate::utils::paths::user_config_dir;

fn parse_listen_port(content: &str) -> Option<u16> {
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let lower = line.to_lowercase();
        if !lower.starts_with("listen ") {
            continue;
        }
        let rest = line[7..].trim();
        let port_token = rest.rsplit(':').next().unwrap_or(rest).trim();
        if let Ok(port) = port_token.parse::<u16>() {
            return Some(port);
        }
    }
    None
}

fn parse_mysql_port(content: &str) -> Option<u16> {
    let mut section = String::new();
    let mut fallback = None;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with(['#', ';']) { continue; }
        if line.starts_with('[') && line.ends_with(']') { section = line.to_ascii_lowercase(); continue; }
        if let Some((key, value)) = line.split_once('=') {
            if key.trim().eq_ignore_ascii_case("port") {
                if let Ok(port) = value.trim().parse::<u16>() {
                    if port == 0 { continue; }
                    if section == "[mysqld]" { return Some(port); }
                    if section == "[client]" || section.is_empty() { fallback = Some(port); }
                }
            }
        }
    }
    if fallback.is_some() { return fallback; }
    None
}

pub fn apache_listen_port() -> u16 {
    let path = user_config_dir().join("httpd.conf");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| parse_listen_port(&c))
        .unwrap_or(80)
}

pub fn mysql_port() -> u16 {
    let path = user_config_dir().join("my.cnf");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| parse_mysql_port(&c))
        .unwrap_or(3306)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_listen_variants() {
        let conf = "# comment\nListen 8080\nListen 127.0.0.1:8443\n";
        assert_eq!(parse_listen_port(conf), Some(8080));
    }

    #[test]
    fn server_port_overrides_client_and_allows_spaces() {
        assert_eq!(parse_mysql_port("[client]\nport=3306\n[mysqld]\nport = 3308\n"), Some(3308));
    }
    #[test]
    fn parse_mysql_port_line() {
        let cnf = "[mysqld]\nport=3307\n";
        assert_eq!(parse_mysql_port(cnf), Some(3307));
    }
}
