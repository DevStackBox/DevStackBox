//! Trusted local HTTPS. CA keys are per-user, never bundled or exported.
use super::vhosts::{load_vhosts, VhostEntry};
use crate::utils::{paths::*, process::create_hidden_command};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, time::Duration};

pub static SITE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub const MKCERT_SHA256: &str = "d2660b50a9ed59eada480750561c96abc2ed4c9a38c6a24d93e30e0977631398";
pub fn tls_dir() -> PathBuf {
    user_config_dir().join("https")
}
pub fn ca_dir() -> PathBuf {
    tls_dir().join("ca")
}
pub fn site_id(host: &str) -> String {
    format!("{:x}", Sha256::digest(host.to_ascii_lowercase().as_bytes()))
}
pub fn leaf(host: &str) -> PathBuf {
    tls_dir().join(format!("{}.pem", site_id(host)))
}
pub fn leaf_key(host: &str) -> PathBuf {
    tls_dir().join(format!("{}-key.pem", site_id(host)))
}
fn openssl(args: &[&str], path: &std::path::Path) -> Result<std::process::Output, String> {
    create_hidden_command(&get_openssl_exe(&get_installation_path()).to_string_lossy())
        .args(args)
        .arg(path)
        .output()
        .map_err(|e| e.to_string())
}
fn mkcert(args: &[String]) -> Result<(), String> {
    let exe = get_installation_path().join("tools/mkcert/mkcert.exe");
    let bytes = fs::read(&exe)
        .map_err(|_| "Bundled mkcert is missing. Repair the installation.".to_string())?;
    if format!("{:x}", Sha256::digest(&bytes)) != MKCERT_SHA256 {
        return Err("Bundled mkcert checksum failed. Repair the installation.".into());
    }
    let out = create_hidden_command(&exe.to_string_lossy())
        .env("CAROOT", ca_dir())
        .env("TRUST_STORES", "system")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "Certificate setup failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}
pub fn ca_trusted() -> bool {
    let cert = ca_dir().join("rootCA.pem");
    let Ok(out) = openssl(&["x509", "-noout", "-fingerprint", "-sha1", "-in"], &cert) else {
        return false;
    };
    if !out.status.success() {
        return false;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let Some((_, hash)) = text.trim().split_once('=') else {
        return false;
    };
    create_hidden_command("certutil.exe")
        .args(["-user", "-store", "Root", &hash.replace(':', "")])
        .output()
        .is_ok_and(|o| o.status.success())
}
pub fn ensure_ca(trust: bool) -> Result<(), String> {
    fs::create_dir_all(ca_dir()).map_err(|e| e.to_string())?;
    // Protect keys before creation, including profiles with permissive inherited ACLs.
    let who = create_hidden_command("whoami.exe")
        .args(["/user", "/fo", "csv", "/nh"])
        .output()
        .map_err(|e| e.to_string())?;
    let who = String::from_utf8_lossy(&who.stdout);
    let sid = who
        .trim()
        .split(',')
        .next_back()
        .unwrap_or("")
        .trim_matches('"');
    if !sid.starts_with("S-1-") {
        return Err("Cannot determine the certificate owner's Windows identity.".into());
    }
    let acl = create_hidden_command("icacls.exe")
        .arg(tls_dir())
        .args([
            "/inheritance:r",
            "/grant:r",
            &format!("*{sid}:(OI)(CI)F"),
            "*S-1-5-18:(OI)(CI)F",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !acl.status.success() {
        return Err("Cannot protect the local certificate directory.".into());
    }
    if trust {
        mkcert(&["-install".into()])?;
    }
    if !ca_dir().join("rootCA.pem").exists() {
        return Err("Set up trusted HTTPS first.".into());
    }
    Ok(())
}
pub fn ensure_leaf(host: &str, aliases: &[String]) -> Result<(), String> {
    let cert = leaf(host);
    let names: Vec<String> = if host == "localhost" {
        vec!["localhost".into(), "127.0.0.1".into(), "::1".into()]
    } else {
        std::iter::once(host.to_string())
            .chain(aliases.iter().cloned())
            .collect()
    };
    let manifest = tls_dir().join(format!("{}.names.json", site_id(host)));
    let wanted = serde_json::to_string(&names).map_err(|e| e.to_string())?;
    let fresh = cert.exists()
        && leaf_key(host).exists()
        && key_matches_certificate(host)
        && fs::read_to_string(&manifest).ok().as_deref() == Some(&wanted)
        && openssl(&["x509", "-checkend", "2592000", "-noout", "-in"], &cert)
            .is_ok_and(|o| o.status.success())
        && create_hidden_command(&get_openssl_exe(&get_installation_path()).to_string_lossy())
            .args(["verify", "-CAfile"])
            .arg(ca_dir().join("rootCA.pem"))
            .arg(&cert)
            .output()
            .is_ok_and(|o| o.status.success());
    if fresh {
        return Ok(());
    }
    let pending = cert.with_extension("pending.pem");
    let pending_key = leaf_key(host).with_extension("pending.pem");
    let mut args = vec![
        "-cert-file".into(),
        pending.to_string_lossy().into_owned(),
        "-key-file".into(),
        pending_key.to_string_lossy().into_owned(),
    ];
    args.extend(names);
    mkcert(&args)?;
    fs::rename(&pending, &cert).map_err(|e| e.to_string())?;
    fs::rename(&pending_key, leaf_key(host)).map_err(|e| e.to_string())?;
    fs::write(manifest, wanted).map_err(|e| e.to_string())?;
    Ok(())
}
fn key_matches_certificate(host: &str) -> bool {
    let cert = openssl(&["x509", "-pubkey", "-noout", "-in"], &leaf(host));
    let key = openssl(&["pkey", "-pubout", "-in"], &leaf_key(host));
    matches!((cert, key), (Ok(c), Ok(k)) if c.status.success() && k.status.success() && c.stdout == k.stdout)
}
pub fn https_port() -> u16 {
    fs::read_to_string(user_config_dir().join("https-port"))
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .filter(|p| *p > 0)
        .unwrap_or(443)
}
pub fn site_url(host: &str) -> String {
    let port = https_port();
    if port == 443 {
        format!("https://{host}/")
    } else {
        format!("https://{host}:{port}/")
    }
}
pub fn https_enabled() -> bool {
    user_config_dir().join("https-enabled").is_file()
}
pub fn render_ssl(entries: &[VhostEntry]) -> Result<String, String> {
    if !https_enabled() {
        return Ok(String::new());
    }
    let mut conf = String::from("# Managed DevStackBox HTTPS\nLoadModule ssl_module modules/mod_ssl.so\nListen 127.0.0.1:443\nListen [::1]:443\nSSLSessionCache none\nSSLProtocol -all +TLSv1.2 +TLSv1.3\n");
    conf = conf.replace(":443", &format!(":{}", https_port()));
    let localhost = VhostEntry::localhost();
    for site in std::iter::once(&localhost).chain(entries.iter().filter(|s| s.enabled && s.https)) {
        if !leaf(&site.domain).exists() || !leaf_key(&site.domain).exists() {
            return Err(format!(
                "Certificate missing for {}. Repair HTTPS.",
                site.domain
            ));
        }
        conf.push_str(&super::vhosts::render_site(site, true)?);
    }
    Ok(conf)
}
pub fn health_alias(host: &str) -> String {
    let file = tls_dir().join(format!("{}.txt", site_id(host)));
    format!(
        "Alias /.devstackbox-health \"{}\"\n<Directory \"{}\">\nRequire local\n</Directory>\n",
        to_apache_path(&file),
        to_apache_path(&tls_dir())
    )
}
pub fn write_health(host: &str) -> Result<(), String> {
    fs::create_dir_all(tls_dir()).map_err(|e| e.to_string())?;
    fs::write(
        tls_dir().join(format!("{}.txt", site_id(host))),
        site_id(host),
    )
    .map_err(|e| e.to_string())
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SiteHealth {
    pub domain: String,
    pub enabled: bool,
    pub https: bool,
    pub trusted: bool,
    pub verified: bool,
    pub message: String,
    pub expiry: Option<String>,
    pub url: String,
}
#[derive(Serialize)]
pub struct SslStatus {
    pub ca_exists: bool,
    pub ca_trusted: bool,
    pub enabled: bool,
    pub sites: Vec<SiteHealth>,
    pub setup_error: Option<String>,
    pub port: u16,
}
pub async fn probe(site: &VhostEntry) -> SiteHealth {
    let mut health = SiteHealth {
        domain: site.domain.clone(),
        enabled: site.enabled,
        https: site.https,
        trusted: ca_trusted(),
        verified: false,
        message: "HTTPS setup required".into(),
        expiry: None,
        url: site_url(&site.domain),
    };
    if let Ok(o) = openssl(&["x509", "-noout", "-enddate", "-in"], &leaf(&site.domain)) {
        if o.status.success() {
            health.expiry = Some(
                String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .trim_start_matches("notAfter=")
                    .into(),
            );
        }
    }
    if !site.enabled {
        health.message = "Site disabled".into();
        return health;
    }
    if !site.https {
        health.message = "HTTP only".into();
        health.url = format!(
            "http://{}:{}/",
            site.domain,
            crate::utils::config_ports::apache_listen_port()
        );
        return health;
    }
    if !https_enabled() {
        return health;
    }
    if !health.trusted {
        health.message = "Windows trust missing - repair HTTPS".into();
        return health;
    }
    if !crate::utils::process::is_our_process_running(
        "httpd.exe",
        &get_apache_exe(&get_installation_path()),
    ) {
        health.message = "Configured; Apache stopped".into();
        return health;
    }
    let result: Result<(), String> = async {
        // System DNS and the Windows native trust store are both exercised. No insecure fallback.
        let client = reqwest::Client::builder()
            .use_native_tls()
            .no_proxy()
            .tls_info(true)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;
        for name in std::iter::once(&site.domain).chain(site.aliases.iter()) {
            let response = client
                .get(format!("{}.devstackbox-health", site_url(name)))
                .send()
                .await
                .map_err(|e| format!("HTTPS verification failed for {name}: {e}"))?;
            let peer = response
                .extensions()
                .get::<reqwest::tls::TlsInfo>()
                .and_then(|i| i.peer_certificate())
                .ok_or("No peer certificate available")?;
            let expected = openssl(&["x509", "-outform", "DER", "-in"], &leaf(&site.domain))?;
            if !expected.status.success()
                || Sha256::digest(peer) != Sha256::digest(&expected.stdout)
            {
                return Err("Apache is serving an unexpected certificate".into());
            }
            if !response.status().is_success()
                || response.text().await.map_err(|e| e.to_string())?.trim() != site_id(&site.domain)
            {
                return Err("Hostname is not serving the expected virtual host".into());
            }
        }
        Ok(())
    }
    .await;
    match result {
        Ok(()) => {
            health.verified = true;
            health.message = "Trusted HTTPS".into();
        }
        Err(e) => health.message = e,
    }
    health
}
#[tauri::command]
pub async fn get_ssl_status() -> Result<SslStatus, String> {
    let mut sites = vec![probe(&VhostEntry::localhost()).await];
    for site in load_vhosts()? {
        sites.push(probe(&site).await);
    }
    Ok(SslStatus {
        ca_exists: ca_dir().join("rootCA.pem").exists(),
        ca_trusted: ca_trusted(),
        enabled: https_enabled(),
        port: https_port(),
        sites,
        setup_error: fs::read_to_string(user_config_dir().join("https-setup-error.txt")).ok(),
    })
}
pub fn lock_configuration() -> Result<std::fs::File, String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    options
        .open(user_config_dir().join("https-operation.lock"))
        .map_err(|_| {
            "Another site or HTTPS operation is running. Wait for it to finish, then retry.".into()
        })
}
pub async fn provision() -> Result<String, String> {
    provision_inner(true, None).await
}
pub async fn renew_existing() -> Result<String, String> {
    provision_inner(false, None).await
}
fn reject_unrecorded_sites(configuration: &str, entries: &[VhostEntry]) -> Result<(), String> {
    for line in configuration.lines() {
        let mut words = line.split_whitespace();
        if !words.next().is_some_and(|word| word.eq_ignore_ascii_case("ServerName")) {
            continue;
        }
        if let Some(name) = words.next() {
            let name = name.trim_matches('"');
            if !name.eq_ignore_ascii_case("localhost")
                && !entries.iter().any(|site| site.enabled && site.domain.eq_ignore_ascii_case(name))
            {
                return Err(format!("Apache contains {name}, but it has no active saved project record. HTTPS setup stopped to preserve the existing configuration. Review Projects and reconnect the existing folder before retrying."));
            }
        }
    }
    Ok(())
}
async fn provision_inner(install_trust: bool, port: Option<u16>) -> Result<String, String> {
    let _guard = SITE_LOCK.lock().await;
    let _process_lock = lock_configuration()?;
    let config = user_config_dir();
    let entries = load_vhosts()?;
    // Renewal must not erase sites that survived only in generated configuration.
    // Run before any certificate, marker, config write or service restart.
    for name in ["vhosts.conf", "ssl.conf"] {
        match fs::read_to_string(config.join(name)) {
            Ok(content) => reject_unrecorded_sites(&content, &entries)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(format!("Cannot inspect {name} before HTTPS setup: {error}")),
        }
    }
    let mut paths = vec![
        config.join("https-enabled"),
        config.join("https-port"),
        config.join("httpd.conf"),
        config.join("phpmyadmin.conf"),
    ];
    for site in std::iter::once(VhostEntry::localhost()).chain(entries.iter().cloned()) {
        paths.extend([
            leaf(&site.domain),
            leaf_key(&site.domain),
            tls_dir().join(format!("{}.names.json", site_id(&site.domain))),
        ]);
    }
    let saved = super::vhosts::snapshot(&paths);
    let was_running = crate::utils::process::is_our_process_running(
        "httpd.exe",
        &get_apache_exe(&get_installation_path()),
    );
    let result: Result<(), String> = async {
        if let Some(port) = port {
            if port == 0 || port == crate::utils::config_ports::apache_listen_port() {
                return Err("Choose a separate HTTPS port between 1 and 65535.".into());
            }
            fs::write(config.join("https-port"), port.to_string()).map_err(|e| e.to_string())?;
        }
        super::apache::ensure_apache_config().await?;
        ensure_ca(install_trust)?;
        ensure_leaf("localhost", &[])?;
        for s in entries.iter().filter(|s| s.enabled && s.https) {
            ensure_leaf(&s.domain, &s.aliases)?;
        }
        fs::write(config.join("https-enabled"), "1").map_err(|e| e.to_string())?;
        if !install_trust
            && saved.iter().all(|(p, bytes)| fs::read(p).ok() == *bytes)
            && fs::read_to_string(config.join("ssl.conf")).ok().as_deref()
                == Some(&render_ssl(&entries)?)
        {
            return Ok(());
        }
        super::vhosts::apply_configuration(&entries).await
    }
    .await;
    if let Err(error) = result {
        super::vhosts::restore(&saved).map_err(|e| format!("{error}; rollback: {e}"))?;
        if was_running {
            let _ = super::apache::stop_apache().await;
            super::apache::start_apache()
                .await
                .map_err(|e| format!("{error}; restored files but restart failed: {e}"))?;
        }
        return Err(error);
    }
    let _ = fs::remove_file(config.join("https-setup-error.txt"));
    Ok(probe(&VhostEntry::localhost()).await.message)
}
#[tauri::command]
pub async fn enable_ssl(port: Option<u16>) -> Result<String, String> {
    provision_inner(true, port).await
}
#[tauri::command]
pub async fn trust_ssl_ca() -> Result<String, String> {
    provision().await
}
#[tauri::command]
pub async fn generate_ssl_cert() -> Result<String, String> {
    provision().await
}
#[tauri::command]
pub async fn disable_ssl() -> Result<String, String> {
    let _guard = SITE_LOCK.lock().await;
    let _process_lock = lock_configuration()?;
    let marker = user_config_dir().join("https-enabled");
    if marker.exists() {
        fs::remove_file(&marker).map_err(|e| e.to_string())?;
    }
    if let Err(e) = super::vhosts::apply_configuration(&load_vhosts()?).await {
        let _ = fs::write(marker, "1");
        return Err(e);
    }
    Ok("HTTPS disabled; certificates and projects preserved".into())
}
pub fn repair_ssl_conf() { /* Configuration is reconciled explicitly, never silently re-enabled. */
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renewal_refuses_to_erase_unrecorded_or_disabled_sites() {
        let config = "# ServerName ignored.test\nServerName localhost\n ServerName \"shop.test\"\n";
        assert!(reject_unrecorded_sites(config, &[]).is_err());
        let mut site = VhostEntry::localhost();
        site.domain = "SHOP.test".into();
        assert!(reject_unrecorded_sites(config, &[site.clone()]).is_ok());
        site.enabled = false;
        assert!(reject_unrecorded_sites(config, &[site]).is_err());
        assert!(reject_unrecorded_sites("ServerName localhost\n# ServerName old.test", &[]).is_ok());
    }
    #[test]
    fn filenames_are_case_normalized_and_do_not_embed_host_input() {
        assert_eq!(site_id("SHOP.test"), site_id("shop.test"));
        assert_eq!(site_id("../bad").len(), 64);
    }
}
