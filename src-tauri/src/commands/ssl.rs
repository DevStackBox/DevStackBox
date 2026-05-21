// HTTPS / SSL for local sites.
//
// Generates a DevStackBox Local Root CA and signs per-host certificates with it.
// The user trusts the CA once in Windows - all generated certs (localhost and
// future virtual hosts) are then automatically trusted by browsers.
//
// CA:             user_config_dir()/ssl/ca.crt + ca.key
// localhost cert: user_config_dir()/ssl/localhost.crt + localhost.key
// Future vhosts:  user_config_dir()/ssl/vhosts/{domain}.crt + .key
// SSL vhost conf: user_config_dir()/ssl.conf  (Included by httpd.conf)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::utils::paths::{get_installation_path, user_config_dir};
use crate::utils::process::create_hidden_command;

// ── types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SslStatus {
    pub ca_exists: bool,
    pub ca_path: String,
    pub cert_exists: bool,
    pub enabled: bool,
    pub cert_expiry: Option<String>,
    pub cert_path: String,
    pub key_path: String,
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn openssl_exe() -> PathBuf {
    get_installation_path()
        .join("apache")
        .join("bin")
        .join("openssl.exe")
}

fn ssl_dir() -> PathBuf {
    let p = user_config_dir().join("ssl");
    let _ = std::fs::create_dir_all(&p);
    p
}

fn ca_crt_path() -> PathBuf {
    ssl_dir().join("ca.crt")
}

fn ca_key_path() -> PathBuf {
    ssl_dir().join("ca.key")
}

fn cert_path() -> PathBuf {
    ssl_dir().join("localhost.crt")
}

fn key_path() -> PathBuf {
    ssl_dir().join("localhost.key")
}

fn ssl_conf_path() -> PathBuf {
    user_config_dir().join("ssl.conf")
}

fn httpd_conf_path() -> PathBuf {
    user_config_dir().join("httpd.conf")
}

/// Returns the Include directive we add to httpd.conf (forward slashes for Apache).
fn ssl_include_directive() -> String {
    let p = ssl_conf_path()
        .to_string_lossy()
        .replace('\\', "/");
    format!("Include \"{}\"", p)
}

/// Check if httpd.conf already includes ssl.conf.
fn httpd_has_ssl_include() -> bool {
    let path = httpd_conf_path();
    if !path.exists() {
        return false;
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    content.contains("ssl.conf")
}

/// Read the notAfter date from the certificate using openssl.
fn read_cert_expiry() -> Option<String> {
    let crt = cert_path();
    if !crt.exists() {
        return None;
    }
    let openssl = openssl_exe();
    if !openssl.exists() {
        return None;
    }
    let output = create_hidden_command(&openssl.to_string_lossy())
        .args(["x509", "-noout", "-enddate", "-in"])
        .arg(&crt)
        .output()
        .ok()?;
    if output.status.success() {
        let raw = String::from_utf8_lossy(&output.stdout);
        // Output looks like: notAfter=May 21 12:00:00 2035 GMT
        raw.trim()
            .strip_prefix("notAfter=")
            .map(|s| s.to_string())
    } else {
        None
    }
}

// ── commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_ssl_status() -> Result<SslStatus, String> {
    let ca = ca_crt_path();
    let crt = cert_path();

    Ok(SslStatus {
        ca_exists: ca.exists(),
        ca_path: ca.to_string_lossy().to_string(),
        cert_exists: crt.exists(),
        enabled: httpd_has_ssl_include(),
        cert_expiry: read_cert_expiry(),
        cert_path: crt.to_string_lossy().to_string(),
        key_path: key_path().to_string_lossy().to_string(),
    })
}

/// Generate the DevStackBox Local Root CA if it does not already exist.
/// This is an internal helper - not exposed as a Tauri command.
fn generate_local_ca(openssl: &str) -> Result<(), String> {
    if ca_crt_path().exists() {
        return Ok(());
    }

    let ca_cfg = ssl_dir().join("ca.cnf");
    std::fs::write(
        &ca_cfg,
        r#"[req]
default_bits       = 4096
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_ca

[dn]
CN = DevStackBox Local CA
O  = DevStackBox
C  = US

[v3_ca]
basicConstraints       = critical,CA:TRUE
keyUsage               = critical,keyCertSign,cRLSign
subjectKeyIdentifier   = hash
"#,
    )
    .map_err(|e| e.to_string())?;

    let out = create_hidden_command(openssl)
        .args([
            "req", "-x509", "-newkey", "rsa:4096",
            "-days", "7300",
            "-nodes",
            "-keyout",
        ])
        .arg(ca_key_path())
        .arg("-out")
        .arg(ca_crt_path())
        .arg("-config")
        .arg(&ca_cfg)
        .output()
        .map_err(|e| format!("Failed to run openssl for CA: {e}"))?;

    let _ = std::fs::remove_file(&ca_cfg);

    if !out.status.success() {
        let _ = std::fs::remove_file(ca_crt_path());
        let _ = std::fs::remove_file(ca_key_path());
        return Err(format!(
            "CA generation failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn generate_ssl_cert() -> Result<String, String> {
    let openssl = openssl_exe();
    if !openssl.exists() {
        return Err(
            "openssl.exe not found in apache/bin. Ensure Apache is installed.".into(),
        );
    }
    let openssl_str = openssl.to_string_lossy().to_string();

    // Ensure ssl dir exists.
    ssl_dir();

    // Step 1: generate (or reuse) the Local Root CA.
    generate_local_ca(&openssl_str)?;

    let key = key_path();
    let crt = cert_path();
    let csr = ssl_dir().join("localhost.csr"); // temp, deleted after signing

    // Step 2: generate private key.
    let out = create_hidden_command(&openssl_str)
        .args(["genrsa", "-out"])
        .arg(&key)
        .arg("2048")
        .output()
        .map_err(|e| format!("genrsa failed: {e}"))?;
    if !out.status.success() {
        return Err(format!("genrsa error: {}", String::from_utf8_lossy(&out.stderr)));
    }

    // Step 3: generate certificate signing request.
    let req_cfg = ssl_dir().join("localhost-req.cnf");
    std::fs::write(
        &req_cfg,
        r#"[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn

[dn]
CN = localhost
O  = DevStackBox
C  = US
"#,
    )
    .map_err(|e| e.to_string())?;

    let out = create_hidden_command(&openssl_str)
        .args(["req", "-new", "-key"])
        .arg(&key)
        .arg("-out")
        .arg(&csr)
        .arg("-config")
        .arg(&req_cfg)
        .output()
        .map_err(|e| format!("CSR generation failed: {e}"))?;
    let _ = std::fs::remove_file(&req_cfg);
    if !out.status.success() {
        return Err(format!("CSR error: {}", String::from_utf8_lossy(&out.stderr)));
    }

    // Step 4: sign CSR with the Local CA.
    let ext_cfg = ssl_dir().join("localhost-ext.cnf");
    std::fs::write(
        &ext_cfg,
        r#"subjectAltName    = @alt_names
basicConstraints  = CA:FALSE
keyUsage          = digitalSignature, keyEncipherment
extendedKeyUsage  = serverAuth

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
IP.2  = ::1
"#,
    )
    .map_err(|e| e.to_string())?;

    let out = create_hidden_command(&openssl_str)
        .args(["x509", "-req", "-days", "3650", "-in"])
        .arg(&csr)
        .args(["-CA"])
        .arg(ca_crt_path())
        .args(["-CAkey"])
        .arg(ca_key_path())
        .arg("-CAcreateserial")
        .arg("-out")
        .arg(&crt)
        .args(["-extfile"])
        .arg(&ext_cfg)
        .output()
        .map_err(|e| format!("Signing failed: {e}"))?;

    let _ = std::fs::remove_file(&csr);
    let _ = std::fs::remove_file(&ext_cfg);
    // Remove the serial file openssl creates next to ca.crt.
    let _ = std::fs::remove_file(ssl_dir().join("ca.srl"));

    if !out.status.success() {
        return Err(format!("Signing error: {}", String::from_utf8_lossy(&out.stderr)));
    }

    Ok(format!(
        "CA and certificate ready.\nCA:   {}\nCert: {}\nKey:  {}",
        ca_crt_path().display(),
        crt.display(),
        key.display()
    ))
}

#[tauri::command]
pub async fn enable_ssl() -> Result<String, String> {
    // Generate cert if missing.
    if !cert_path().exists() {
        generate_ssl_cert().await?;
    }

    let install = get_installation_path();
    let apache_root = install.join("apache");
    let config_dir = user_config_dir();
    let crt = cert_path();
    let key = key_path();

    // Write ssl.conf with LoadModule directives and SSL VirtualHost.
    let ssl_conf = format!(
        r#"# DevStackBox SSL Configuration
# Auto-generated by DevStackBox. Included by httpd.conf when SSL is enabled.

LoadModule ssl_module modules/mod_ssl.so
LoadModule socache_shmcb_module modules/mod_socache_shmcb.so

Listen 443

<VirtualHost *:443>
    DocumentRoot "{www}"
    ServerName localhost

    SSLEngine on
    SSLCertificateFile "{crt}"
    SSLCertificateKeyFile "{key}"

    SSLSessionCache shmcb:"{logs}/ssl_scache(512000)"
    SSLSessionCacheTimeout 300

    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    <Directory "{www}">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html index.htm index.php
    </Directory>

    # PHP CGI
    ScriptAlias /php/ "{install}/php/current/"
    Action php-script /php/php-cgi.exe
    AddHandler php-script .php
    AddType application/x-httpd-php .php

    <Directory "{install}/php/current">
        AllowOverride None
        Options ExecCGI
        Require all granted
    </Directory>

    # phpMyAdmin
    Include "{config}/phpmyadmin.conf"

    ErrorLog "{logs}/ssl-error.log"
    CustomLog "{logs}/ssl-access.log" common
</VirtualHost>
"#,
        www = config_dir
            .join("..").join("www")
            .canonicalize()
            .unwrap_or_else(|_| install.join("www"))
            .to_string_lossy()
            .replace('\\', "/"),
        crt = crt.to_string_lossy().replace('\\', "/"),
        key = key.to_string_lossy().replace('\\', "/"),
        logs = config_dir
            .join("..").join("logs")
            .canonicalize()
            .unwrap_or_else(|_| install.join("logs"))
            .to_string_lossy()
            .replace('\\', "/"),
        install = install.to_string_lossy().replace('\\', "/"),
        config = config_dir.to_string_lossy().replace('\\', "/"),
    );

    let _ = apache_root; // referenced via install
    std::fs::write(ssl_conf_path(), ssl_conf).map_err(|e| e.to_string())?;

    // Append Include to httpd.conf if not already present.
    if !httpd_has_ssl_include() {
        let httpd = httpd_conf_path();
        if !httpd.exists() {
            return Err(
                "httpd.conf not found. Start Apache once to auto-generate it.".into(),
            );
        }
        let mut content = std::fs::read_to_string(&httpd).map_err(|e| e.to_string())?;
        content.push('\n');
        content.push_str(&ssl_include_directive());
        content.push('\n');
        std::fs::write(&httpd, content).map_err(|e| e.to_string())?;
    }

    Ok("SSL enabled. Restart Apache to apply changes.".into())
}

#[tauri::command]
pub async fn disable_ssl() -> Result<String, String> {
    let httpd = httpd_conf_path();
    if httpd.exists() {
        let content = std::fs::read_to_string(&httpd).map_err(|e| e.to_string())?;
        // Remove the Include line for ssl.conf (any variant).
        let filtered: String = content
            .lines()
            .filter(|line| !line.contains("ssl.conf"))
            .map(|line| format!("{line}\n"))
            .collect();
        std::fs::write(&httpd, filtered).map_err(|e| e.to_string())?;
    }

    Ok("SSL disabled. Restart Apache to apply changes.".into())
}
