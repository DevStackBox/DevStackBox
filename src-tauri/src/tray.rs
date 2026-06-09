// System tray setup — menu build, live status poller, and event handlers.
//
// This module is the single source of truth for the tray icon. It builds the
// menu once, holds cloned MenuItem handles so labels can be updated at runtime
// via MenuItem::set_text, and spawns a 5-second background poller that keeps
// the labels and tooltip in sync with the actual service state.
//
// Menu layout:
//   Show DevStackBox
//   ─────────────────
//   Apache  🟢  Running      ← click to toggle
//   MySQL   🟢  Running      ← click to toggle
//   ─────────────────
//   Open www Folder
//   Open phpMyAdmin
//   ─────────────────
//   Hide to Tray
//   Quit

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::commands::apache::get_apache_status;
use crate::commands::mysql::get_mysql_status;
use crate::utils::paths::user_www_dir;

// ─── State ───────────────────────────────────────────────────────────────────

// Holds cloned MenuItem handles so the background poller can call set_text
// without needing to look them up through the menu tree again.
// MenuItem<tauri::Wry> is Send + Sync, so wrapping in Arc is enough.
pub struct TrayMenuState {
    apache_item: tauri::menu::MenuItem<tauri::Wry>,
    mysql_item: tauri::menu::MenuItem<tauri::Wry>,
}

// SAFETY: MenuItem wraps reference-counted OS handles; Tauri documents that
// clones of the same item point to the same underlying object.
unsafe impl Send for TrayMenuState {}
unsafe impl Sync for TrayMenuState {}

// ─── Label helpers ───────────────────────────────────────────────────────────

fn fmt_label(service: &str, running: bool) -> String {
    if running {
        format!("{}  🟢  Running", service)
    } else {
        format!("{}  🔴  Stopped", service)
    }
}

// ─── Status refresh ──────────────────────────────────────────────────────────

// Queries both services, updates menu item labels and tray tooltip.
// Called by the poller and by the frontend-exposed `refresh_tray_menu` command.
pub async fn refresh_tray_status(app: &AppHandle) {
    let apache_running = get_apache_status()
        .await
        .map(|s| s.running)
        .unwrap_or(false);
    let mysql_running = get_mysql_status()
        .await
        .map(|s| s.running)
        .unwrap_or(false);

    // Update menu item labels
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.apache_item.set_text(fmt_label("Apache", apache_running));
        let _ = state.mysql_item.set_text(fmt_label("MySQL", mysql_running));
    }

    // Update tooltip
    let tooltip = format!(
        "DevStackBox\nApache: {}\nMySQL: {}",
        if apache_running { "Running" } else { "Stopped" },
        if mysql_running { "Running" } else { "Stopped" },
    );
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

// ─── Quick-action helpers ─────────────────────────────────────────────────────

fn open_www_folder(app: &AppHandle) {
    let www = user_www_dir();
    // Ensure the directory exists so Explorer doesn't error
    let _ = std::fs::create_dir_all(&www);
    let _ = app.opener().open_path(www.to_string_lossy().as_ref(), None::<&str>);
}

fn open_phpmyadmin(app: &AppHandle) {
    let _ = app.opener().open_url("http://localhost/phpmyadmin", None::<&str>);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Build menu items — start with Stopped labels; the poller will update them
    // within the first second.
    let show_item = MenuItemBuilder::new("Show DevStackBox")
        .id("show")
        .build(app)?;

    let apache_item = MenuItemBuilder::new(fmt_label("Apache", false))
        .id("apache")
        .build(app)?;
    let mysql_item = MenuItemBuilder::new(fmt_label("MySQL", false))
        .id("mysql")
        .build(app)?;

    let open_www_item = MenuItemBuilder::new("Open www Folder")
        .id("open_www")
        .build(app)?;
    let open_pma_item = MenuItemBuilder::new("Open phpMyAdmin")
        .id("open_phpmyadmin")
        .build(app)?;

    let hide_item = MenuItemBuilder::new("Hide to Tray")
        .id("hide")
        .build(app)?;
    let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;

    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&sep)
        .item(&apache_item)
        .item(&mysql_item)
        .item(&sep2)
        .item(&open_www_item)
        .item(&open_pma_item)
        .item(&sep3)
        .item(&hide_item)
        .item(&quit_item)
        .build()?;

    // Store clones in managed state so the poller and commands can update them
    app.manage(TrayMenuState {
        apache_item: apache_item.clone(),
        mysql_item: mysql_item.clone(),
    });

    let app_handle = app.handle().clone();

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("DevStackBox - PHP Development Environment")
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(move |_app, event| {
            let app = _app.clone();
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "apache" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::apache::toggle_apache().await;
                        refresh_tray_status(&app).await;
                        // Notify frontend so its status badges also update
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("tray-services-updated", ());
                        }
                    });
                }
                "mysql" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::mysql::toggle_mysql().await;
                        refresh_tray_status(&app).await;
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("tray-services-updated", ());
                        }
                    });
                }
                "open_www" => {
                    open_www_folder(&app);
                }
                "open_phpmyadmin" => {
                    open_phpmyadmin(&app);
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(move |tray, event| {
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

    // Spawn the background poller — runs every 5 seconds
    tauri::async_runtime::spawn(async move {
        // Give the app half a second to finish startup before first poll
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        loop {
            refresh_tray_status(&app_handle).await;
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    });

    println!("System tray initialized with live status poller.");
    Ok(())
}
