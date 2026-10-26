use crate::commands::database_workspace::*;
// DevStackBox - Tauri application entry point.
//
// Roadmap Phase 2: this file holds only module declarations and `run()`.
// All command implementations live in `commands/`; helpers in `utils/`.

pub mod commands;
pub mod tray;
pub mod types;
pub mod utils;

use tauri::{Emitter, Manager};

use crate::commands::app_update::{check_app_update, get_updater_endpoint};
use crate::commands::apache::{get_apache_status, start_apache, stop_apache, toggle_apache};
use crate::commands::config::{
    backup_config, list_config_backups, read_config, restore_config_backup, update_config,
};
use crate::commands::fullbackup::{create_full_backup, delete_full_backup, list_full_backups, open_backups_folder, restore_full_backup};
use crate::commands::logs::{get_service_logs, log_crash_event};
use crate::commands::log_management::*;
use crate::commands::migration::{detect_xampp_installations, import_from_xampp};
use crate::commands::mysql::{
    backup_mysql_database, backup_mysql_database_named, create_mysql_database, create_mysql_user,
    drop_mysql_database, drop_mysql_user,
    get_mysql_status, list_mysql_databases, list_mysql_databases_detailed, list_mysql_users,
    set_mysql_user_password, start_mysql, stop_mysql, toggle_mysql,
};
use crate::commands::mysql_import::{
    apply_php_recommended_import_limits, get_sql_restore_file_info, pick_sql_restore_file,
    restore_mysql_from_file,
};
use crate::commands::php::{
    download_php_version, get_php_status, get_php_versions, list_php_extensions,
    open_php_terminal, switch_php_version, toggle_php, toggle_php_extension,
};
use crate::commands::system::{
    check_binaries, create_directory_structure, debug_installation, debug_paths, export_diagnostics_bundle,
    get_app_settings, get_autostart, get_phpmyadmin_url, get_system_info, list_www_projects,
    restart_all_services, set_app_settings, set_autostart, start_all_services,
    stop_all_services, test_apache_config, test_mysql_config,
};
use crate::commands::security::analyze_security;
use crate::commands::ssl::{trust_ssl_ca, disable_ssl, enable_ssl, generate_ssl_cert, get_ssl_status};
use crate::commands::vhosts::{add_vhost, get_hosts_entries, list_vhosts, remove_vhost, toggle_vhost, update_hosts_entry};
use crate::commands::terminal::{kill_terminal_session, resize_terminal, send_terminal_input, spawn_terminal, TerminalSessions};
use crate::commands::tray::{hide_to_tray, quit_app, refresh_tray_menu, set_tray_tooltip, show_main_window};
use crate::utils::app_settings::read_app_settings;
use crate::utils::paths::ensure_user_data_dirs;
use crate::utils::phpmyadmin_config::{ensure_phpmyadmin_config_inc, patch_phpmyadmin_config};
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
            crate::commands::projects::choose_project_folder,
            crate::commands::projects::open_project_folder,
            crate::commands::projects::create_project_folder,
            crate::commands::projects::suggest_document_root,
            crate::commands::projects::get_project_diagnostics,
            crate::commands::vhosts::set_project_php_version,
            crate::commands::projects::get_site_configuration_warnings,
            check_binaries,
            debug_paths,
            debug_installation,
            start_all_services,
            restart_all_services,
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
            inspect_database_files,
            database_collations,
            create_database_with_options,
            database_operations,
            cancel_database_operation,
            start_database_operation,
            pick_database_files,
            pick_database_destination,
            database_backups,
            verify_database_backup,
            delete_database_backup,
            database_details,
            database_grants,
            set_database_grants,
            backup_mysql_database,
            backup_mysql_database_named,
            list_mysql_databases,
            list_mysql_databases_detailed,
            pick_sql_restore_file,
            get_sql_restore_file_info,
            restore_mysql_from_file,
            apply_php_recommended_import_limits,
            list_mysql_users,
            create_mysql_user,
            create_mysql_database,
            drop_mysql_database,
            drop_mysql_user,
            set_mysql_user_password,
            open_php_terminal,
            get_service_logs,
            read_log_chunk,
            get_log_policy,
            set_log_policy,
            archive_log,
            delete_log_contents,
            list_log_archives,
            read_log_archive,
            delete_log_archive,
            export_log_archive,
            open_log_archives,
            run_log_maintenance,
            log_crash_event,
            read_config,
            update_config,
            backup_config,
            list_config_backups,
            restore_config_backup,
            create_directory_structure,
            get_autostart,
            set_autostart,
            get_app_settings,
            set_app_settings,
            get_system_info,
            get_phpmyadmin_url,
            list_www_projects,
            export_diagnostics_bundle,
            get_updater_endpoint,
            check_app_update,
            show_main_window,
            hide_to_tray,
            set_tray_tooltip,
            refresh_tray_menu,
            quit_app,
            spawn_terminal,
            send_terminal_input,
            resize_terminal,
            kill_terminal_session,
            analyze_security,
            get_ssl_status,
            trust_ssl_ca,
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
            open_backups_folder,
            detect_xampp_installations,
            import_from_xampp
        ])
        .setup(|app| {
            println!("DevStackBox setup complete, initializing...");

            // Roadmap Phase 1.8: ensure user data root and subdirs exist
            // before any service can try to read/write configs or data.
            ensure_user_data_dirs();
            crate::commands::log_management::start_maintenance();
            let _ = ensure_phpmyadmin_config_inc();
            let _ = patch_phpmyadmin_config();

            // Installer runs this in the interactive user's context. First launch is a
            // fallback for a deferred installer handoff or a newly signed-in user.
            if crate::utils::paths::get_installation_path().join("https-autosetup").exists()
                && !crate::commands::ssl::https_enabled()
            {
                tauri::async_runtime::spawn(async {
                    if let Err(error) = crate::commands::ssl::provision().await {
                        let _ = std::fs::write(crate::utils::paths::user_config_dir().join("https-setup-error.txt"), error);
                    }
                });
            } else if crate::commands::ssl::https_enabled() {
                tauri::async_runtime::spawn(async {
                    if let Err(error) = crate::commands::ssl::renew_existing().await {
                        let _ = std::fs::write(crate::utils::paths::user_config_dir().join("https-setup-error.txt"), error);
                    }
                });
            }
            crate::tray::setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if crate::commands::database_workspace::has_active_database_operation() {
                    api.prevent_close();
                    let _ = window.emit("database-close-blocked", ());
                    return;
                }
                let settings = read_app_settings();
                if settings.minimize_to_tray {
                    let _ = window.emit("window-hidden-to-tray", ());
                    window.hide().unwrap_or_default();
                    api.prevent_close();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
