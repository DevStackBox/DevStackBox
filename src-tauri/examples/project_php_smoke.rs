//! Run only with an empty DEVSTACKBOX_DATA_DIR under review-artifacts.
//! Requires PHP 8.3 and 8.5 already installed in the development checkout.
use devstackbox_lib::{
    commands::{apache, ssl, vhosts},
    utils::paths::*,
};
use std::fs;

fn main() {
    let profile = std::env::var("DEVSTACKBOX_DATA_DIR").expect("Isolated profile required");
    assert!(profile.contains("review-artifacts"));
    assert!(
        !user_config_dir().join("vhosts.json").exists(),
        "Use a fresh test profile"
    );
    tauri::async_runtime::block_on(async {
        apache::ensure_apache_config().await.unwrap();
        let config = user_config_dir();
        let conf = fs::read_to_string(config.join("httpd.conf"))
            .unwrap()
            .replace(":80", ":18191");
        fs::write(config.join("httpd.conf"), conf).unwrap();
        let fixture = get_user_data_root().join("project with spaces");
        fs::create_dir_all(&fixture).unwrap();
        fs::write(fixture.join("index.php"), "<?php header('Content-Type: application/json'); echo json_encode(['version'=>PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION,'ini'=>php_ini_loaded_file(),'extension_dir'=>ini_get('extension_dir')]);").unwrap();
        let mut first = vhosts::VhostEntry::localhost();
        first.id = "first".into();
        first.domain = "php83.test".into();
        first.https = false;
        first.doc_root = to_apache_path(&fixture);
        first.project_root = first.doc_root.clone();
        let mut second = first.clone();
        second.id = "second".into();
        second.domain = "php85.test".into();
        fs::write(
            config.join("vhosts.json"),
            serde_json::to_vec(&vec![first, second]).unwrap(),
        )
        .unwrap();
        let result: Result<(), String> = async {
            vhosts::set_project_php_version("first".into(), Some("8.3".into())).await?;
            vhosts::set_project_php_version("second".into(), Some("8.5".into())).await?;
            assert!(
                vhosts::set_project_php_version("first".into(), Some("9.9".into()))
                    .await
                    .is_err()
            );
            apache::start_apache().await?;
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap();
            for (host, expected) in [("php83.test", "8.3"), ("php85.test", "8.5")] {
                let response = client
                    .get("http://127.0.0.1:18191/")
                    .header("Host", host)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                let body = response.text().await.map_err(|e| e.to_string())?;
                let value: serde_json::Value =
                    serde_json::from_str(&body).map_err(|e| format!("{host}: {e}: {body}"))?;
                assert_eq!(value["version"], expected);
                assert!(value["extension_dir"].as_str().unwrap().contains(expected));
                assert!(value["ini"].as_str().unwrap().contains(expected));
            }
            // Build test-only TLS leaves. Trust is scoped to this client, never the Windows store.
            fs::create_dir_all(ssl::tls_dir()).unwrap();
            fs::write(
                config.join("test-openssl.cnf"),
                "[req]\ndistinguished_name=dn\n[dn]\n",
            )
            .unwrap();
            let output =
                std::process::Command::new(get_installation_path().join("apache/bin/openssl.exe"))
                    .args(["req", "-config"])
                    .arg(config.join("test-openssl.cnf"))
                    .args([
                        "-x509",
                        "-newkey",
                        "rsa:2048",
                        "-nodes",
                        "-days",
                        "1",
                        "-subj",
                        "/CN=localhost",
                        "-addext",
                        "subjectAltName=DNS:localhost,DNS:php83.test,DNS:php85.test",
                        "-keyout",
                    ])
                    .arg(ssl::leaf_key("localhost"))
                    .arg("-out")
                    .arg(ssl::leaf("localhost"))
                    .output()
                    .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).into());
            }
            for host in ["php83.test", "php85.test"] {
                fs::copy(ssl::leaf("localhost"), ssl::leaf(host)).unwrap();
                fs::copy(ssl::leaf_key("localhost"), ssl::leaf_key(host)).unwrap();
            }
            fs::write(config.join("https-enabled"), "1").unwrap();
            fs::write(config.join("https-port"), "18192").unwrap();
            let mut sites = vhosts::load_vhosts()?;
            for site in &mut sites {
                site.https = true;
            }
            vhosts::apply_configuration(&sites).await?;
            let certificate =
                reqwest::Certificate::from_pem(&fs::read(ssl::leaf("localhost")).unwrap()).unwrap();
            let tls = reqwest::Client::builder()
                .use_rustls_tls()
                .no_proxy()
                .add_root_certificate(certificate)
                .resolve("php83.test", "127.0.0.1:18192".parse().unwrap())
                .resolve("php85.test", "127.0.0.1:18192".parse().unwrap())
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap();
            for (host, expected) in [("php83.test", "8.3"), ("php85.test", "8.5")] {
                let value: serde_json::Value = tls
                    .get(format!("https://{host}:18192/"))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?;
                assert_eq!(value["version"], expected);
            }
            for site in &mut sites {
                site.https = false;
            }
            vhosts::apply_configuration(&sites).await?;
            vhosts::set_project_php_version("first".into(), Some("8.5".into())).await?;
            let saved = vhosts::load_vhosts()?;
            assert!(saved
                .iter()
                .all(|site| site.php_version.as_deref() == Some("8.5")));
            let switched: serde_json::Value = client
                .get("http://127.0.0.1:18191/")
                .header("Host", "php83.test")
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            assert_eq!(switched["version"], "8.5");
            vhosts::set_project_php_version("first".into(), None).await?;
            assert_eq!(
                vhosts::load_vhosts()?[1].php_version.as_deref(),
                Some("8.5")
            );
            for (host, expected) in [("php83.test", "8.3"), ("php85.test", "8.5")] {
                let value: serde_json::Value = client
                    .get("http://127.0.0.1:18191/")
                    .header("Host", host)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?;
                assert_eq!(value["version"], expected);
            }
            Ok(())
        }
        .await;
        let stop = apache::stop_apache().await;
        result.unwrap();
        stop.unwrap();
        println!("PASS: PHP 8.3/8.5 on simultaneous HTTP and HTTPS sites; versioned ini/extensions; missing version rejection; selection persistence and reset isolation.");
    });
}
