//! Opt-in Windows integration check. Uses an isolated profile and an ALREADY
//! mapped test hostname; never changes the system hosts file or installed app.
use devstackbox_lib::{
    commands::{apache, projects, ssl, vhosts},
    utils::paths::*,
};
use std::fs;

fn main() {
    let profile =
        std::env::var("DEVSTACKBOX_DATA_DIR").expect("An isolated test profile is required");
    assert!(
        profile.contains("review-artifacts"),
        "Refusing a normal user profile"
    );
    tauri::async_runtime::block_on(async {
        let domain = "new.test";
        let mappings = vhosts::get_hosts_entries().await.unwrap();
        assert!(
            mappings
                .iter()
                .any(|s| s.split_whitespace().collect::<Vec<_>>() == vec!["127.0.0.1", domain]),
            "Map the test hostname first"
        );
        let config = user_config_dir();
        let original = fs::read(config.join("vhosts.json")).ok();
        assert!(
            vhosts::load_vhosts().unwrap().is_empty(),
            "Use an empty test profile"
        );
        let fixture = get_user_data_root().join("fixture project");
        fs::create_dir_all(fixture.join("public")).unwrap();
        fs::write(
            fixture.join("public/index.php"),
            "<?php echo 'DSB-HTTPS-PHP-OK';",
        )
        .unwrap();
        let project = fixture.to_string_lossy().to_string();
        let root = projects::suggest_document_root(project.clone())
            .await
            .unwrap();
        assert!(root.ends_with("public"));
        let operation_lock = ssl::lock_configuration().unwrap();
        let overlapping = vhosts::add_vhost(domain.into(), root.clone(), Some(true), None, Some(project.clone()), None).await;
        assert!(overlapping.unwrap_err().contains("operation is running"));
        drop(operation_lock);
        assert!(projects::create_project_folder("CON".into()).await.is_err());
        assert!(vhosts::add_vhost(
            "invalid.local".into(),
            root.clone(),
            Some(true),
            None,
            Some(project.clone()),
            None
        )
        .await
        .is_err());
        vhosts::add_vhost(
            domain.into(),
            root.clone(),
            Some(true),
            None,
            Some(project.clone()),
            None,
        )
        .await
        .unwrap();
        let health = ssl::get_ssl_status().await.unwrap();
        assert!(
            health.sites.iter().all(|s| s.verified),
            "{:?}",
            health.sites
        );
        let client = reqwest::Client::builder()
            .use_native_tls()
            .no_proxy()
            .build()
            .unwrap();
        let url = ssl::site_url(domain);
        assert_eq!(
            client.get(&url).send().await.unwrap().text().await.unwrap(),
            "DSB-HTTPS-PHP-OK"
        );
        assert_eq!(
            client
                .get(format!("{url}phpmyadmin/"))
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        assert!(vhosts::add_vhost(
            domain.to_uppercase(),
            root.clone(),
            Some(true),
            None,
            Some(project.clone()),
            None
        )
        .await
        .is_err());
        // Editing preserves routing and never mutates an already-owned mapping.
        vhosts::add_vhost(
            domain.into(),
            root,
            Some(true),
            None,
            Some(project),
            Some(domain.into()),
        )
        .await
        .unwrap();
        assert!(
            ssl::probe(&vhosts::load_vhosts().unwrap()[0])
                .await
                .verified
        );
        let original_port = ssl::https_port();
        let conflict = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let occupied_port = conflict.local_addr().unwrap().port();
        assert!(
            ssl::enable_ssl(Some(occupied_port)).await.is_err(),
            "An occupied HTTPS port must fail"
        );
        assert_eq!(ssl::https_port(), original_port);
        assert!(
            ssl::probe(&vhosts::load_vhosts().unwrap()[0])
                .await
                .verified,
            "Rollback must restore working HTTPS"
        );
        drop(conflict);
        let cert = fs::read(ssl::leaf(domain)).unwrap();
        fs::write(ssl::leaf_key(domain), "invalid test key").unwrap();
        ssl::renew_existing().await.unwrap();
        assert_ne!(
            cert,
            fs::read(ssl::leaf(domain)).unwrap(),
            "Mismatched key must cause renewal"
        );
        assert!(
            ssl::probe(&vhosts::load_vhosts().unwrap()[0])
                .await
                .verified
        );
        // Restore only this disposable profile, leaving the existing hosts entry.
        vhosts::apply_configuration(&[]).await.unwrap();
        if let Some(bytes) = original {
            fs::write(config.join("vhosts.json"), bytes).unwrap();
        }
        assert!(ssl::get_ssl_status().await.unwrap().sites[0].verified);
        println!("PASS: localhost trust, .test routing, PHP, public root with spaces, phpMyAdmin isolation, invalid name, reserved folder, duplicate, edit, occupied-port rollback, key repair, profile restore");
        let _ = apache::stop_apache().await;
    });
}
