use devstackbox_lib::commands::{apache, database_workspace, fullbackup, mysql};
use tauri::Listener;
fn main() {
    let base = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    assert!(
        base.join("qualification.marker").exists(),
        "Disposable installation required"
    );
    let profile = std::env::var("DEVSTACKBOX_DATA_DIR").unwrap();
    assert!(std::path::Path::new(&profile)
        .join("qualification.marker")
        .exists());
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let app = tauri::Builder::default()
        .build(context)
        .expect("Tauri qualification runtime");
    let handle = app.handle().clone();
    let phase = std::env::var("QUAL_PHASE").unwrap_or_default();
    let action = std::env::var("QUAL_ACTION").unwrap_or_default();
    let profile2 = profile.clone();
    let guarded_handle = handle.clone();
    handle.listen("full-backup-progress", move |event| {
        let value: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
        let stage = value["stage"].as_str().unwrap_or("");
        println!("PHASE {stage}");
        if stage == phase {
            std::fs::write(std::path::Path::new(&profile2).join("phase-reached"), stage).unwrap();
            if action == "cancel" {
                fullbackup::cancel_full_backup();
            }
            if action == "cancel-delay" {
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    fullbackup::cancel_full_backup();
                });
            }
            if action == "kill" {
                std::process::abort();
            }
            if action == "services" {
                assert!(database_workspace::has_active_database_operation());
                let guarded_handle = guarded_handle.clone();
                // Separate thread avoids nesting the event loop/runtime.
                std::thread::spawn(move || {
                    tauri::async_runtime::block_on(async {
                        assert!(apache::stop_apache().await.is_err());
                        assert!(mysql::stop_mysql().await.is_err());
                        assert!(devstackbox_lib::commands::tray::quit_app(guarded_handle)
                            .await
                            .is_err());
                        println!("SERVICE_STOPS_REJECTED");
                        println!("APPLICATION_QUIT_REJECTED");
                    })
                })
                .join()
                .unwrap();
            }
        }
    });
    std::thread::spawn(move || {
        let result = tauri::async_runtime::block_on(async {
            match std::env::var("QUAL_MODE").unwrap().as_str() {
                "backup" => fullbackup::create_full_backup(
                    handle.clone(),
                    format!("qual-{}", std::process::id()),
                )
                .await
                .map(|b| b.path),
                "restore" => {
                    fullbackup::restore_full_backup(
                        handle.clone(),
                        std::env::var("QUAL_ARCHIVE").unwrap(),
                    )
                    .await
                }
                "restart" => Ok("No restore invoked on harness restart".into()),
                _ => Err("Unknown mode".into()),
            }
        });
        std::fs::write(
            std::path::Path::new(&profile).join("result.json"),
            serde_json::to_vec(&result).unwrap(),
        )
        .unwrap();
        println!("RESULT {result:?}");
        handle.exit(if result.is_ok() { 0 } else { 2 });
    });
    app.run(|_, _| {});
}
