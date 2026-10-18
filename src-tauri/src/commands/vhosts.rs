use super::ssl;
use crate::utils::{paths::*, process::create_hidden_command};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VhostEntry {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub php_version: Option<String>,
    pub domain: String,
    pub doc_root: String,
    pub enabled: bool,
    #[serde(default)]
    pub https: bool,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub project_root: String,
}
impl VhostEntry {
    pub fn localhost() -> Self {
        Self {
            id: "localhost".into(),
            php_version: None,
            domain: "localhost".into(),
            doc_root: user_www_dir().to_string_lossy().into_owned(),
            enabled: true,
            https: true,
            aliases: vec![],
            project_root: String::new(),
        }
    }
    fn names(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.domain.as_str()).chain(self.aliases.iter().map(String::as_str))
    }
}
pub fn load_vhosts() -> Result<Vec<VhostEntry>, String> {
    let path = user_config_dir().join("vhosts.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut sites: Vec<VhostEntry> = serde_json::from_str(
        &fs::read_to_string(path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| {
        format!("Site configuration is damaged; restore a backup before changing sites: {e}")
    })?;
    assign_project_ids(&mut sites)?;
    Ok(sites)
}
// Legacy IDs are deterministic until the next successful save persists them.
// Edits retain that ID even when the hostname changes.
fn assign_project_ids(sites: &mut [VhostEntry]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for site in sites {
        if site.id.is_empty() {
            site.id = format!("project-{}", ssl::site_id(&site.domain));
        }
        if !seen.insert(site.id.clone()) {
            return Err(
                "Duplicate project IDs in site configuration; restore a backup before editing."
                    .into(),
            );
        }
    }
    Ok(())
}
pub fn normalize_domain(domain: &str) -> Result<String, String> {
    let d = domain.trim().to_ascii_lowercase();
    if d.len() > 253
        || d.is_empty()
        || d.split('.').any(|s| {
            s.is_empty()
                || s.len() > 63
                || s.starts_with('-')
                || s.ends_with('-')
                || !s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        })
    {
        return Err(
            "Enter a hostname such as my-project.test, without a URL, port or path.".into(),
        );
    }
    if d == "localhost" || d.ends_with(".localhost") || d.parse::<std::net::IpAddr>().is_ok() {
        return Err("localhost and IP addresses are managed by DevStackBox.".into());
    }
    Ok(d)
}
fn validate_new_name(name: &str) -> Result<String, String> {
    let d = normalize_domain(name)?;
    if !d.ends_with(".test") {
        return Err("Use a .test hostname for new local sites.".into());
    }
    Ok(d)
}
fn safe_root(root: &str) -> Result<String, String> {
    let p = Path::new(root);
    if !p.is_absolute()
        || root
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '<' | '>'))
    {
        return Err("Choose an absolute folder path without quotes or control characters.".into());
    }
    if !p.is_dir() {
        return Err("Choose an existing folder, or create a project first.".into());
    }
    Ok(to_apache_path(
        &fs::canonicalize(p).map_err(|e| e.to_string())?,
    ))
}
pub fn render_site(site: &VhostEntry, tls: bool) -> Result<String, String> {
    let port = if tls {
        ssl::https_port()
    } else {
        crate::utils::config_ports::apache_listen_port()
    };
    let root = to_apache_path(Path::new(&site.doc_root));
    let (runtime, ini) = if let Some(version) = site.php_version.as_deref() {
        let (runtime, ini) = super::php::project_runtime(version)?;
        if !ini.is_file() {
            return Err(format!("PHP {version} project configuration is missing. Reapply its version in Project details."));
        }
        (runtime, ini)
    } else {
        (active_php_dir(), user_config_dir())
    };
    let php = to_apache_path(&runtime);
    let phprc = if site.php_version.is_some() {
        to_apache_path(&ini)
    } else {
        format!("{}/", to_apache_path(&ini))
    };
    let config = to_apache_path(&user_config_dir());
    let mut conf=format!("\n<VirtualHost *:{port}>\nServerName {}\nDocumentRoot \"{root}\"\n<Directory \"{root}\">\nOptions -Indexes +FollowSymLinks\nAllowOverride All\nRequire local\nDirectoryIndex index.php index.html index.htm\n</Directory>\nScriptAlias /php/ \"{php}/\"\n<Directory \"{php}\">\nOptions +ExecCGI\nRequire local\n</Directory>\nAction php-script /php/php-cgi.exe\nAddHandler php-script .php\nAddType application/x-httpd-php .php\nSetEnv PHPRC \"{phprc}\"\n",site.domain);
    if !site.aliases.is_empty() {
        conf.push_str(&format!("ServerAlias {}\n", site.aliases.join(" ")));
    }
    if tls {
        conf.push_str(&format!(
            "SSLEngine on\nSSLCertificateFile \"{}\"\nSSLCertificateKeyFile \"{}\"\n",
            to_apache_path(&ssl::leaf(&site.domain)),
            to_apache_path(&ssl::leaf_key(&site.domain))
        ));
    }
    if site.domain == "localhost" {
        conf.push_str(&format!("IncludeOptional \"{config}/phpmyadmin.conf\"\n"));
    } else {
        conf.push_str(
            "<LocationMatch \"^/(phpmyadmin|pma)(/|$)\">\nRequire all denied\n</LocationMatch>\n",
        );
    }
    conf.push_str(&ssl::health_alias(&site.domain));
    conf.push_str("</VirtualHost>\n");
    // Pinned runtimes use a version-specific ini, never the global current junction.
    Ok(conf)
}
pub(crate) fn snapshot(paths: &[PathBuf]) -> Vec<(PathBuf, Option<Vec<u8>>)> {
    paths
        .iter()
        .map(|p| (p.clone(), fs::read(p).ok()))
        .collect()
}
pub(crate) fn restore(files: &[(PathBuf, Option<Vec<u8>>)]) -> Result<(), String> {
    for (p, data) in files {
        if let Some(data) = data {
            fs::write(p, data).map_err(|e| e.to_string())?;
        } else if p.exists() {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
pub async fn apply_configuration(entries: &[VhostEntry]) -> Result<(), String> {
    let config = user_config_dir();
    let saved = snapshot(&[
        config.join("vhosts.conf"),
        config.join("ssl.conf"),
        config.join("vhosts.json"),
    ]);
    let running = crate::utils::process::is_our_process_running(
        "httpd.exe",
        &get_apache_exe(&get_installation_path()),
    );
    let result: Result<(), String> = async {
        let mut http =
            String::from("# Managed DevStackBox sites; localhost is defined in httpd.conf\n");
        for site in entries.iter().filter(|s| s.enabled) {
            ssl::write_health(&site.domain)?;
            http.push_str(&render_site(site, false)?);
        }
        ssl::write_health("localhost")?;
        fs::write(config.join("vhosts.conf"), http).map_err(|e| e.to_string())?;
        fs::write(config.join("ssl.conf"), ssl::render_ssl(entries)?).map_err(|e| e.to_string())?;
        let out =
            create_hidden_command(&get_apache_exe(&get_installation_path()).to_string_lossy())
                .arg("-f")
                .arg(config.join("httpd.conf"))
                .arg("-t")
                .output()
                .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(format!(
                "Apache rejected the configuration ({}): {}",
                out.status,
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        if running {
            super::apache::stop_apache().await?;
            super::apache::start_apache().await?;
            if ssl::https_enabled() && ssl::ca_trusted() {
                for site in std::iter::once(&VhostEntry::localhost())
                    .chain(entries.iter().filter(|s| s.enabled && s.https))
                {
                    let health = ssl::probe(site).await;
                    if !health.verified {
                        return Err(format!(
                            "Live verification failed for {}: {}",
                            site.domain, health.message
                        ));
                    }
                }
            }
        }
        fs::write(
            config.join("vhosts.json"),
            serde_json::to_vec_pretty(entries).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        restore(&saved).map_err(|e| format!("{error}; configuration rollback failed: {e}"))?;
        if running {
            let _ = super::apache::stop_apache().await;
            super::apache::start_apache().await.map_err(|e| {
                format!("{error}; previous config restored but Apache restart failed: {e}")
            })?;
        }
        return Err(format!("{error}. Previous configuration restored."));
    }
    Ok(())
}
const BEGIN: &str = "# DevStackBox BEGIN";
const END: &str = "# DevStackBox END";
fn hosts_path() -> PathBuf {
    PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()))
        .join("System32/drivers/etc/hosts")
}
pub fn edit_hosts(content: &str, domain: &str, add: bool) -> Result<String, String> {
    let domain = normalize_domain(domain)?;
    if content.matches(BEGIN).count() != content.matches(END).count()
        || content.matches(BEGIN).count() > 1
    {
        return Err(
            "Hosts file has malformed DevStackBox markers. Resolve them before continuing.".into(),
        );
    }
    let mut inside = false;
    let mut lines = vec![];
    let mut existed = false;
    for line in content.lines() {
        if line.trim() == BEGIN {
            inside = true;
            lines.push(line.to_string());
            continue;
        }
        if line.trim() == END {
            if !inside {
                return Err("Hosts markers are out of order".into());
            }
            if add {
                lines.push(format!("127.0.0.1 {domain}"));
            }
            inside = false;
            existed = true;
            lines.push(line.to_string());
            continue;
        }
        let before_comment = line.split('#').next().unwrap_or("");
        let tokens: Vec<_> = before_comment.split_whitespace().collect();
        let matches = tokens
            .iter()
            .skip(1)
            .any(|h| h.eq_ignore_ascii_case(&domain));
        if matches && !inside && add {
            return Err(format!("{domain} exists outside the DevStackBox hosts block. Resolve that mapping explicitly."));
        }
        if matches && inside {
            let mut retained: Vec<_> = tokens
                .iter()
                .skip(1)
                .filter(|h| !h.eq_ignore_ascii_case(&domain))
                .copied()
                .collect();
            if !retained.is_empty() {
                retained.insert(0, tokens[0]);
                let mut kept = retained.join(" ");
                if let Some((_, comment)) = line.split_once('#') {
                    kept.push_str(&format!(" #{comment}"));
                }
                lines.push(kept);
            }
            continue;
        }
        lines.push(line.to_string());
    }
    if inside {
        return Err("Hosts block is not closed".into());
    }
    if add && !existed {
        lines.extend([BEGIN.into(), format!("127.0.0.1 {domain}"), END.into()]);
    }
    Ok(lines.join("\r\n") + "\r\n")
}
pub fn elevated_hosts_change(domain: &str, action: &str) -> Result<(), String> {
    let domain = normalize_domain(domain)?;
    if !matches!(action, "add" | "remove") {
        return Err("Invalid hosts operation".into());
    }
    let path = hosts_path();
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Cannot read UTF-8 hosts file: {e}"))?;
    let updated = edit_hosts(&content, &domain, action == "add")?;
    fs::write(path, updated).map_err(|e| e.to_string())
}
async fn change_hosts(domain: &str, add: bool) -> Result<(), String> {
    let domain = normalize_domain(domain)?;
    let content = fs::read_to_string(hosts_path()).map_err(|e| e.to_string())?;
    edit_hosts(&content, &domain, add)?;
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\'', "''");
    let action = if add { "add" } else { "remove" };
    let command=format!("$p=Start-Process -FilePath '{exe}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '--hosts-operation','{action}','{domain}'; exit $p.ExitCode");
    let out = create_hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(
            "Windows hostname update failed or permission was declined. No site was activated."
                .into(),
        );
    }
    Ok(())
}
#[tauri::command]
pub async fn get_hosts_entries() -> Result<Vec<String>, String> {
    let content = fs::read_to_string(hosts_path()).map_err(|e| e.to_string())?;
    let mut inside = false;
    let mut entries = vec![];
    for line in content.lines() {
        if line.trim() == BEGIN {
            inside = true;
        } else if line.trim() == END {
            inside = false;
        } else if inside && !line.trim().is_empty() && !line.trim().starts_with('#') {
            entries.push(line.into());
        }
    }
    Ok(entries)
}
#[tauri::command]
pub async fn update_hosts_entry(domain: String, action: String) -> Result<String, String> {
    let _guard = ssl::SITE_LOCK.lock().await;
    let _process_lock = ssl::lock_configuration()?;
    if !matches!(action.as_str(), "add" | "remove") {
        return Err("Invalid action".into());
    }
    if action == "remove"
        && load_vhosts()?
            .iter()
            .any(|s| s.enabled && s.names().any(|n| n.eq_ignore_ascii_case(&domain)))
    {
        return Err("Disable or disconnect the site before removing its hostname mapping.".into());
    }
    change_hosts(&domain, action == "add").await?;
    Ok("Hostname mapping updated".into())
}
#[tauri::command]
pub async fn list_vhosts() -> Result<Vec<VhostEntry>, String> {
    load_vhosts()
}
async fn commit_sites(old: &[VhostEntry], entries: &[VhostEntry]) -> Result<(), String> {
    super::apache::ensure_apache_config().await?;
    let old_names: std::collections::BTreeSet<_> = old
        .iter()
        .filter(|s| s.enabled)
        .flat_map(|s| s.names().map(str::to_string))
        .collect();
    let new_names: std::collections::BTreeSet<_> = entries
        .iter()
        .filter(|s| s.enabled)
        .flat_map(|s| s.names().map(str::to_string))
        .collect();
    let mut changed = vec![];
    let files: Vec<_> = entries
        .iter()
        .flat_map(|s| {
            [
                ssl::leaf(&s.domain),
                ssl::leaf_key(&s.domain),
                ssl::tls_dir().join(format!("{}.names.json", ssl::site_id(&s.domain))),
            ]
        })
        .collect();
    let saved = snapshot(&files);
    let was_running = crate::utils::process::is_our_process_running(
        "httpd.exe",
        &get_apache_exe(&get_installation_path()),
    );
    let result: Result<(), String> = async {
        if entries.iter().any(|s| s.enabled && s.https) {
            if !ssl::https_enabled() || !ssl::ca_trusted() {
                return Err("Set up trusted localhost HTTPS on the HTTPS page first.".into());
            }
            for s in entries.iter().filter(|s| s.enabled && s.https) {
                ssl::ensure_leaf(&s.domain, &s.aliases)?;
            }
        }
        for name in new_names.difference(&old_names) {
            let existing = get_hosts_entries().await?.iter().any(|l| {
                l.split('#')
                    .next()
                    .unwrap_or("")
                    .split_whitespace()
                    .skip(1)
                    .any(|h| h.eq_ignore_ascii_case(name))
            });
            if !existing {
                change_hosts(name, true).await?;
                changed.push((name.clone(), true));
            }
        }
        for name in old_names.difference(&new_names) {
            change_hosts(name, false).await?;
            changed.push((name.clone(), false));
        }
        apply_configuration(entries).await
    }
    .await;
    if let Err(error) = result {
        let mut rollback = vec![];
        if let Err(e) = restore(&saved) {
            rollback.push(e);
        }
        for (name, added) in changed.into_iter().rev() {
            if let Err(e) = change_hosts(&name, !added).await {
                rollback.push(e);
            }
        }
        if was_running {
            let _ = super::apache::stop_apache().await;
            if let Err(e) = super::apache::start_apache().await {
                rollback.push(e);
            }
        }
        return Err(if rollback.is_empty() {
            error
        } else {
            format!(
                "{error}. Recovery requires attention: {}",
                rollback.join("; ")
            )
        });
    }
    Ok(())
}
#[tauri::command]
pub async fn add_vhost(
    domain: String,
    doc_root: String,
    https: Option<bool>,
    aliases: Option<Vec<String>>,
    project_root: Option<String>,
    previous_domain: Option<String>,
) -> Result<(), String> {
    let _guard = ssl::SITE_LOCK.lock().await;
    let _process_lock = ssl::lock_configuration()?;
    let domain = validate_new_name(&domain)?;
    let doc_root = safe_root(&doc_root)?;
    let project_root = safe_root(project_root.as_deref().unwrap_or(&doc_root))?;
    let aliases = aliases
        .unwrap_or_default()
        .iter()
        .map(|s| validate_new_name(s))
        .collect::<Result<Vec<_>, _>>()?;
    let old = load_vhosts()?;
    let mut entries = old.clone();
    let enabled = previous_domain
        .as_ref()
        .and_then(|previous| old.iter().find(|s| &s.domain == previous))
        .is_none_or(|site| site.enabled);
    let id = previous_domain
        .as_ref()
        .and_then(|previous| old.iter().find(|s| &s.domain == previous))
        .map(|site| site.id.clone())
        .unwrap_or_else(|| {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            format!("project-{}", ssl::site_id(&format!("{domain}-{nonce}")))
        });
    if let Some(previous) = previous_domain.as_ref() {
        if !entries.iter().any(|s| s.domain == *previous) {
            return Err("The site changed; refresh before editing.".into());
        }
        entries.retain(|s| s.domain != *previous);
    }
    let names: Vec<_> = std::iter::once(&domain).chain(aliases.iter()).collect();
    let mut seen = std::collections::HashSet::new();
    for name in names {
        if !seen.insert(name)
            || entries
                .iter()
                .any(|s| s.names().any(|n| n.eq_ignore_ascii_case(name)))
        {
            return Err(format!("Hostname {name} is already used."));
        }
    }
    entries.push(VhostEntry {
        id,
        php_version: previous_domain
            .as_ref()
            .and_then(|previous| old.iter().find(|s| &s.domain == previous))
            .and_then(|site| site.php_version.clone()),
        domain,
        doc_root,
        enabled,
        https: https.unwrap_or(true),
        aliases,
        project_root,
    });
    commit_sites(&old, &entries).await
}
#[tauri::command]
pub async fn set_project_php_version(
    project_id: String,
    version: Option<String>,
) -> Result<(), String> {
    let _guard = ssl::SITE_LOCK.lock().await;
    let _process_lock = ssl::lock_configuration()?;
    let old = load_vhosts()?;
    let mut entries = old.clone();
    let site = entries
        .iter_mut()
        .find(|site| site.id == project_id)
        .ok_or("Project no longer exists. Refresh the project list.")?;
    if let Some(version) = version.as_deref() {
        super::php::prepare_project_runtime(version)?;
    }
    site.php_version = version;
    commit_sites(&old, &entries).await
}
#[tauri::command]
pub async fn remove_vhost(domain: String) -> Result<(), String> {
    let _guard = ssl::SITE_LOCK.lock().await;
    let _process_lock = ssl::lock_configuration()?;
    let old = load_vhosts()?;
    let entries: Vec<_> = old.iter().filter(|s| s.domain != domain).cloned().collect();
    if old.len() == entries.len() {
        return Err("Site not found".into());
    }
    commit_sites(&old, &entries).await
}
#[tauri::command]
pub async fn toggle_vhost(domain: String, enabled: bool) -> Result<(), String> {
    let _guard = ssl::SITE_LOCK.lock().await;
    let _process_lock = ssl::lock_configuration()?;
    let old = load_vhosts()?;
    let mut entries = old.clone();
    entries
        .iter_mut()
        .find(|s| s.domain == domain)
        .ok_or("Site not found")?
        .enabled = enabled;
    commit_sites(&old, &entries).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_local_domains() {
        assert_eq!(validate_new_name(" Shop.TEST ").unwrap(), "shop.test");
        for n in [
            "localhost",
            "x.local",
            "x.host",
            "https://x.test",
            "-x.test",
            "x..test",
            "x.test\nX",
        ] {
            assert!(validate_new_name(n).is_err(), "{n}");
        }
    }
    #[test]
    fn preserves_unmanaged_and_shared_hosts_lines() {
        let s="# custom\r\n127.0.0.1 outside.test\r\n# DevStackBox BEGIN\r\n127.0.0.1 one.test two.test # keep\r\n# DevStackBox END\r\n";
        let out = edit_hosts(s, "one.test", false).unwrap();
        assert!(out.contains("outside.test"));
        assert!(out.contains("127.0.0.1 two.test # keep"));
        assert!(!out.contains("one.test"));
        assert!(edit_hosts(s, "outside.test", true).is_err());
    }
    #[test]
    fn rejects_malformed_hosts_block() {
        assert!(edit_hosts("# DevStackBox BEGIN\n", "x.test", true).is_err());
    }
    #[test]
    fn legacy_sites_migrate_without_assuming_https() {
        let sites: Vec<VhostEntry> =
            serde_json::from_str(r#"[{"domain":"old.test","doc_root":"C:/www","enabled":true}]"#)
                .unwrap();
        assert!(!sites[0].https);
        assert!(sites[0].aliases.is_empty());
    }
    #[test]
    fn project_identity_survives_rename_and_reload() {
        let mut sites: Vec<VhostEntry> =
            serde_json::from_str(r#"[{"domain":"old.test","doc_root":"C:/www","enabled":true}]"#)
                .unwrap();
        assign_project_ids(&mut sites).unwrap();
        let id = sites[0].id.clone();
        assert!(!id.is_empty());
        sites[0].domain = "renamed.test".into();
        let mut reloaded: Vec<VhostEntry> =
            serde_json::from_slice(&serde_json::to_vec(&sites).unwrap()).unwrap();
        assign_project_ids(&mut reloaded).unwrap();
        assert_eq!(reloaded[0].id, id);
        reloaded.push(reloaded[0].clone());
        assert!(assign_project_ids(&mut reloaded).is_err());
    }
}
