// System tray commands.

use tauri::tray::TrayIconId;
use tauri::Manager;

#[tauri::command]
pub async fn show_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_to_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

// Phase 5.3 - tray polish.
//
// Pushes a fresh tooltip onto the default tray icon. The frontend calls this
// from its service status poll loop with a short summary string such as
// "DevStackBox\nApache: Running\nMySQL: Stopped\nPHP: 8.2.12".
#[tauri::command]
pub async fn set_tray_tooltip(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    let tray_id = TrayIconId::new("main");
    if let Some(tray) = app_handle.tray_by_id(&tray_id) {
        tray.set_tooltip(Some(text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Forces an immediate tray menu label + tooltip refresh.
// Called from the frontend after an in-app service toggle so the tray labels
// update without waiting for the next 5-second poll cycle.
#[tauri::command]
pub async fn refresh_tray_menu(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::tray::refresh_tray_status(&app_handle).await;
    Ok(())
}
