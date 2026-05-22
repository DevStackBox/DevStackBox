// DevStackBox - Tauri application entry point.
//
// Roadmap Phase 2: this file holds only module declarations and `run()`.
// All command implementations live in `commands/`; helpers in `utils/`.

pub mod commands;
pub mod types;
pub mod utils;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

use crate::commands::apache::{get_apache_status, start_apache, stop_apache, toggle_apache};
use crate::commands::config::{
    backup_config, list_config_backups, read_config, restore_config_backup, update_config,
};
use crate::commands::fullbackup::{create_full_backup, delete_full_backup, list_full_backups, open_backups_folder, restore_full_backup};
use crate::commands::logs::{get_service_logs, log_crash_event};
use crate::commands::mysql::{
    backup_mysql_database, backup_mysql_database_named, create_mysql_user, drop_mysql_user,
    get_mysql_status, list_mysql_databases, list_mysql_databases_detailed, list_mysql_users,
    restore_mysql_database, set_mysql_user_password, start_mysql, stop_mysql, toggle_mysql,
};
use crate::commands::php::{
    download_php_version, get_php_status, get_php_versions, list_php_extensions,
    open_php_terminal, switch_php_version, toggle_php, toggle_php_extension,
};
use crate::commands::system::{
    check_binaries, create_directory_structure, debug_installation, debug_paths, get_autostart,
    get_system_info, set_autostart, start_all_services, stop_all_services, test_apache_config,
    test_mysql_config,
};
use crate::commands::security::analyze_security;
use crate::commands::ssl::{disable_ssl, enable_ssl, generate_ssl_cert, get_ssl_status};
use crate::commands::vhosts::{add_vhost, get_hosts_entries, list_vhosts, remove_vhost, toggle_vhost, update_hosts_entry};
use crate::commands::terminal::{kill_terminal_session, send_terminal_input, spawn_terminal, TerminalSessions};
use crate::commands::tray::{hide_to_tray, quit_app, set_tray_tooltip, show_main_window};
use crate::utils::paths::ensure_user_data_dirs;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("Starting DevStackBox application...");

    tauri::Builder::default()
        .manage(Arc::new(TerminalSessions::new()))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_binaries,
            debug_paths,
            debug_installation,
            start_all_services,
            stop_all_services,
            test_apache_config,
            test_mysql_config,
            get_mysql_status,
            get_php_status,
            get_apache_status,
            start_mysql,
            stop_mysql,
            start_apache,
            stop_apache,
            get_php_versions,
            switch_php_version,
            download_php_version,
            list_php_extensions,
            toggle_php_extension,
            toggle_mysql,
            toggle_php,
            toggle_apache,
            backup_mysql_database,
            backup_mysql_database_named,
            list_mysql_databases,
            list_mysql_databases_detailed,
            restore_mysql_database,
            list_mysql_users,
            create_mysql_user,
            drop_mysql_user,
            set_mysql_user_password,
            open_php_terminal,
            get_service_logs,
            log_crash_event,
            read_config,
            update_config,
            backup_config,
            list_config_backups,
            restore_config_backup,
            create_directory_structure,
            get_autostart,
            set_autostart,
            get_system_info,
            show_main_window,
            hide_to_tray,
            set_tray_tooltip,
            quit_app,
            spawn_terminal,
            send_terminal_input,
            kill_terminal_session,
            analyze_security,
            get_ssl_status,
            generate_ssl_cert,
            enable_ssl,
            disable_ssl,
            list_vhosts,
            add_vhost,
            remove_vhost,
            toggle_vhost,
            get_hosts_entries,
            update_hosts_entry,
            create_full_backup,
            list_full_backups,
            restore_full_backup,
            delete_full_backup,
            open_backups_folder
        ])
        .setup(|app| {
            println!("DevStackBox setup complete, setting up system tray...");

            // Roadmap Phase 1.8: ensure user data root and subdirs exist
            // before any service can try to read/write configs or data.
            ensure_user_data_dirs();

            // System tray menu
            let show_item = MenuItemBuilder::new("Show DevStackBox").id("show").build(app)?;
            let hide_item = MenuItemBuilder::new("Hide to Tray").id("hide").build(app)?;
            let mysql_item = MenuItemBuilder::new("Toggle MySQL").id("mysql").build(app)?;
            let apache_item = MenuItemBuilder::new("Toggle Apache").id("apache").build(app)?;
            let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&mysql_item)
                .item(&apache_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip("DevStackBox - PHP Development Environment")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(move |_app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "mysql" => {
                        // Phase 5.3 - quick toggle from tray.
                        // Delegate to the frontend so it can run the same
                        // start/stop pipeline (config check, error toast,
                        // status refresh) used by the UI buttons.
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.emit("tray-toggle-service", "mysql");
                        }
                    }
                    "apache" => {
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.emit("tray-toggle-service", "apache");
                        }
                    }
                    "quit" => {
                        _app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                })
                .build(app)?;

            println!("System tray initialized successfully!");
            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept the native close button (X) so the app hides to the
            // system tray instead of exiting.  The user can quit via the
            // tray context menu "Quit" item.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Tell the frontend BEFORE hiding so the notification can
                // be dispatched while the webview is still active.
                let _ = window.emit("window-hidden-to-tray", ());
                window.hide().unwrap_or_default();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
